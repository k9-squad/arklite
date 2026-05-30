<script lang="ts">
  import type { OpDef } from '../game/types';

  let { def }: { def: OpDef } = $props();

  function build(d: OpDef): { w: number; cells: string[] } {
    // 默认朝上：display row = -fwd, col = side
    const cov = new Set(d.range.map(([f, s]) => -f + ',' + s));
    let minR = 0, maxR = 0, minC = 0, maxC = 0;
    for (const [f, s] of d.range) {
      minR = Math.min(minR, -f); maxR = Math.max(maxR, -f);
      minC = Math.min(minC, s); maxC = Math.max(maxC, s);
    }
    const cells: string[] = [];
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        let cls = 'rgc';
        if (r === 0 && c === 0) cls += ' self';
        else if (cov.has(r + ',' + c)) cls += d.support ? ' heal' : ' cov';
        cells.push(cls);
      }
    }
    return { w: maxC - minC + 1, cells };
  }

  const grid = $derived(build(def));
</script>

<div class="rangeGrid" style="grid-template-columns:repeat({grid.w},18px)">
  {#each grid.cells as cls}
    <div class={cls}></div>
  {/each}
</div>
