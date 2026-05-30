<script lang="ts">
  let {
    cost, life, wave, speed, levelLabel, running, started, over, onPause, onSpeed, onRestart,
  }: {
    cost: number; life: number; wave: string; speed: number; levelLabel: string;
    running: boolean; started: boolean; over: boolean;
    onPause: () => void; onSpeed: () => void; onRestart: () => void;
  } = $props();

  const paused = $derived(started && !running && !over);
</script>

<div id="hud">
  <div class="stat"><span class="lbl">费用</span><span class="cost">{cost}</span></div>
  <div class="stat"><span class="lbl">生命</span><span class="life">{life}</span></div>
  <div class="stat"><span class="lbl">波次</span><span class="wave">{wave}</span></div>
  <div class="lvl">{levelLabel}</div>
  <div class="spacer"></div>
  {#if paused}
    <button class="btn warn" onclick={onRestart}>重开</button>
  {/if}
  <button class="btn" onclick={onSpeed} disabled={!started || over}>{speed}x</button>
  <button class="btn" onclick={onPause} disabled={!started || over}>
    {running ? '暂停' : '继续'}
  </button>
</div>
