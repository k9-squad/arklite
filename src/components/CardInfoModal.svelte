<script lang="ts">
  import type { OpDef } from '../game/types';
  import RangeGrid from './RangeGrid.svelte';

  let {
    def, canAfford, started, onClose, onDeploy,
  }: {
    def: OpDef;
    canAfford: boolean;
    started: boolean;
    onClose: () => void;
    onDeploy: () => void;
  } = $props();

  const tags = $derived([def.roleTxt, def.melee ? '部署：地面' : '部署：高台', def.tier]);
  const stats = $derived([
    [def.support ? '治疗量' : '攻击力', def.atk],
    ['攻击间隔', def.interval + 's'],
    ['生命值', def.hp],
    ['阻挡数', def.melee ? def.block : '—'],
    ['部署费用', def.cost],
  ] as Array<[string, string | number]>);
  const btnText = $derived(
    !started ? '请先开始游戏' : canAfford ? `部署（${def.cost} 费）` : `费用不足（需 ${def.cost}）`,
  );
</script>

<div id="cardInfo" onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="modal">
    <div class="modalHead">
      <span class="ciName" style="color:{def.color}">{def.name}</span>
      <button class="xbtn" onclick={onClose} aria-label="关闭">×</button>
    </div>

    <div class="tags">
      {#each tags as t}<span class="tag">{t}</span>{/each}
    </div>

    <RangeGrid {def} />

    <div class="oiStats">
      {#each stats as [l, v]}<span>{l} <b>{v}</b></span>{/each}
    </div>

    <p class="ciDesc">{def.atkTxt}<br />{def.blockTxt}</p>

    <button class="btn ciDeploy" disabled={!canAfford} onclick={onDeploy}>{btnText}</button>
  </div>
</div>
