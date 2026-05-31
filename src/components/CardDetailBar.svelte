<script lang="ts">
  import type { OpDef } from '../game/types';
  import RangeGrid from './RangeGrid.svelte';

  let {
    def, canAfford, started, placing, onDeploy, onCancel,
  }: {
    def: OpDef;
    canAfford: boolean;
    started: boolean;
    placing: boolean;   // 是否正处于该卡的部署选位状态
    onDeploy: () => void;
    onCancel: () => void;
  } = $props();

  const dmgType = $derived(def.support ? '治疗' : def.magic ? '魔法' : '物理');
  const stats = $derived([
    [def.support ? '治疗' : '攻击', def.atk],
    ['间隔', def.interval + 's'],
    ['生命', def.hp],
    ['阻挡', def.melee ? def.block : '—'],
    ['费用', def.cost],
  ] as Array<[string, string | number]>);
</script>

<div id="cardBar">
  <div class="cbGrid"><RangeGrid {def} /></div>
  <div class="cbBody">
    <div class="cbHead">
      <span class="cbName" style="color:{def.color}">{def.name}</span>
      <span class="cbType">{def.roleTxt}</span>
    </div>
    <div class="cbStats">
      {#each stats as [l, v]}<span>{l}<b>{v}</b></span>{/each}
    </div>
    <div class="cbDesc">{def.atkTxt}</div>
  </div>
  <div class="cbActions">
    {#if placing}
      <button class="btn warn cbBtn" onclick={onCancel}>取消</button>
      <span class="cbHint">点击高亮格部署</span>
    {:else}
      <button class="btn cbBtn deploy" disabled={!started || !canAfford} onclick={onDeploy}>
        {!started ? '未开始' : canAfford ? '部署' : '费用不足'}
      </button>
      <button class="btn ghost cbBtn" onclick={onCancel}>关闭</button>
    {/if}
  </div>
</div>
