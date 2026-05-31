<script lang="ts">
  import type { OpDef, OpKind } from '../game/types';
  import { OPS, OP_ORDER } from '../game/operators';

  let {
    affordable, placingKind, openKind, onCard,
  }: {
    affordable: (k: OpKind) => boolean;
    placingKind: OpKind | null;
    openKind: OpKind | null;
    onCard: (k: OpKind) => void;
  } = $props();

  const defs: OpDef[] = OP_ORDER.map((k) => OPS[k]);
</script>

<div id="dock">
  {#each defs as o (o.kind)}
    <div
      class="op"
      class:dis={!affordable(o.kind)}
      class:sel={placingKind === o.kind || openKind === o.kind}
      data-k={o.kind}
      role="button"
      tabindex="0"
      onclick={() => onCard(o.kind)}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onCard(o.kind)}
    >
      <div class="nm" style="color:{o.color}">{o.name}</div>
      <div class="sub">{o.sub}</div>
      <div class="cc">{o.cost}</div>
    </div>
  {/each}
</div>
