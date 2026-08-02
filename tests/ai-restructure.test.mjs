import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const core = require('../jsmind/ai-restructure.js');

function sampleTree() {
  return {
    meta: { name: '测试文档' },
    format: 'node_tree',
    data: {
      id: 'root',
      topic: '项目计划',
      children: [
        {
          id: 'context-before',
          topic: '背景',
          children: []
        },
        {
          id: 'scope-parent',
          topic: '执行方案',
          children: [
            {
              id: 'node-a',
              topic: '准备材料',
              notes: '材料备注',
              data: { type: 'heading', level: 3, notes: '材料备注', icon: 'check' },
              children: [{ id: 'node-a-1', topic: '列清单', data: { type: 'list' }, children: [] }]
            },
            {
              id: 'node-b',
              topic: '安排人员',
              notes: '人员备注',
              data: { type: 'heading', level: 3, notes: '人员备注' },
              children: []
            },
            {
              id: 'node-c',
              topic: '范围外节点',
              children: []
            }
          ]
        },
        {
          id: 'other-parent',
          topic: '复盘',
          children: [{ id: 'other-child', topic: '结论', children: [] }]
        }
      ]
    }
  };
}

test('单选父节点时锁定父节点并覆盖其全部后代范围', () => {
  const full = sampleTree();
  const scope = core.resolveScope(full, ['scope-parent']);

  assert.equal(scope.type, 'subtree');
  assert.equal(scope.parentId, 'scope-parent');
  assert.deepEqual(scope.selectedRootIds, ['node-a', 'node-b', 'node-c']);
  assert.equal(scope.sourceNodeCount, 4);
});

test('多选只接受同一父节点下的同级节点', () => {
  const full = sampleTree();
  const scope = core.resolveScope(full, ['node-b', 'node-a']);

  assert.equal(scope.type, 'siblings');
  assert.deepEqual(scope.selectedRootIds, ['node-a', 'node-b']);
  assert.throws(
    () => core.resolveScope(full, ['node-a', 'other-child']),
    error => error && error.code === 'NOT_SIBLINGS'
  );
});

test('标题与结构模式合并节点时保留原备注和主要节点标识', () => {
  const full = sampleTree();
  const scope = core.resolveScope(full, ['node-a', 'node-b']);
  const tokens = core.assignSourceTokens(scope);
  const parsed = [{
    topic: '[MW:S1,S3] 资源准备',
    data: { type: 'heading', level: 2 },
    children: [{ topic: '[MW:NEW] 明确负责人', data: { type: 'heading', level: 3 }, children: [] }]
  }];

  const proposal = core.materializeProposal(parsed, {
    tokenToSource: tokens.tokenToSource,
    includeNotes: false,
    allExistingIds: Array.from(core.buildIndex(full).keys()),
    parentId: scope.parentId
  });

  assert.equal(proposal.roots[0].id, 'node-a');
  assert.equal(proposal.roots[0].topic, '资源准备');
  assert.match(proposal.roots[0].notes, /材料备注/);
  assert.match(proposal.roots[0].notes, /人员备注/);
  assert.equal(proposal.roots[0].data.icon, 'check');
  assert.match(proposal.roots[0].children[0].id, /^ai_/);

  const applied = core.buildAppliedTree(full, scope, proposal.roots);
  const parent = core.buildIndex(applied).get('scope-parent').node;
  assert.deepEqual(parent.children.map(node => node.id), ['node-a', 'node-c']);
  assert.equal(core.buildIndex(applied).has('node-b'), false);
  assert.equal(core.buildIndex(full).has('node-b'), true, '原始树不能被预览阶段修改');

  const summary = core.summarizeChanges(scope, proposal.roots, proposal.sourceIdsByProposal);
  assert.equal(summary.counts.added, 1);
  assert.equal(summary.counts.removed, 2);
  assert.equal(summary.merged, 1);
  assert.equal(summary.removedWithContent, 1);
});

test('包含备注模式采用AI的新备注，并拒绝缺少来源标识的结果', () => {
  const full = sampleTree();
  const scope = core.resolveScope(full, ['node-a', 'node-b']);
  const tokens = core.assignSourceTokens(scope);
  const proposal = core.materializeProposal([
    { topic: '[MW:S1] 准备资源', notes: 'AI改写后的备注', children: [] },
    { topic: '[MW:NEW] 风险检查', notes: '新增备注', children: [] }
  ], {
    tokenToSource: tokens.tokenToSource,
    includeNotes: true,
    allExistingIds: Array.from(core.buildIndex(full).keys()),
    parentId: scope.parentId
  });

  assert.equal(proposal.roots[0].notes, 'AI改写后的备注');
  assert.equal(proposal.roots[1].notes, '新增备注');
  assert.throws(
    () => core.materializeProposal([{ topic: '没有标识', children: [] }], {
      tokenToSource: tokens.tokenToSource,
      allExistingIds: []
    }),
    error => error && error.code === 'MISSING_SOURCE_MARKER'
  );
});

test('整次重构只产生一条撤销记录，并能完整恢复原树', async () => {
  const undoSource = await readFile(new URL('../jsmind/plugins/undo_manager.js', import.meta.url), 'utf8');
  let current = sampleTree();
  const context = {
    console: { log() {}, warn() {}, error() {} },
    document: { addEventListener() {} },
    window: {},
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(undoSource, context, { filename: 'undo_manager.js' });

  const manager = new context.window.UndoManager({
    maxCapacity: 10,
    getCurrentDocumentId: () => 'doc-1',
    getSnapshot: () => JSON.stringify({ data: current }),
    restoreSnapshot: snapshot => {
      current = JSON.parse(snapshot).data;
      return true;
    }
  });
  manager._recordNow();

  const scope = core.resolveScope(current, ['scope-parent']);
  const tokens = core.assignSourceTokens(scope);
  const proposal = core.materializeProposal([
    { topic: '[MW:S1] 重新准备材料', children: [] },
    { topic: '[MW:NEW] 验收', children: [] }
  ], {
    tokenToSource: tokens.tokenToSource,
    includeNotes: false,
    allExistingIds: Array.from(core.buildIndex(current).keys()),
    parentId: scope.parentId
  });

  current = core.buildAppliedTree(current, scope, proposal.roots);
  assert.equal(manager._recordNow(), true);
  assert.equal(manager.getStacks().undo.length, 1);
  assert.equal(core.buildIndex(current).has('node-b'), false);

  assert.equal(manager.undo(), true);
  assert.equal(core.buildIndex(current).has('node-b'), true);
  assert.equal(core.buildIndex(current).get('node-a').node.topic, '准备材料');
});

test('页面契约包含预览入口、整体AI动作和可撤销提示', async () => {
  const [html, handler, restructure, modal, host] = await Promise.all([
    readFile(new URL('../jsmind/mindmap.html', import.meta.url), 'utf8'),
    readFile(new URL('../jsmind/ai-handler.js', import.meta.url), 'utf8'),
    readFile(new URL('../jsmind/ai-restructure.js', import.meta.url), 'utf8'),
    readFile(new URL('../ai/newai/AIServiceModal.html', import.meta.url), 'utf8'),
    readFile(new URL('../init.js', import.meta.url), 'utf8')
  ]);

  assert.match(html, /id="aiRestructurePreview"/);
  assert.match(html, /id="aiRestructureUndoBtn"/);
  assert.match(html, /onclick="openAIRestructure\(\)"/);
  assert.match(handler, /msg\.actionType === 'restructure_tree'/);
  assert.match(restructure, /presetPrompt:\s*prompt/);
  assert.match(modal, /case 'restructure_tree':/);
  assert.match(modal, /usagePromptInput\.dataset\.resolved = presetPrompt/);
  assert.match(modal, /postSilentAIError\(msg\)/);
  assert.match(host, /AIServiceModal\.html\?v=/);
});
