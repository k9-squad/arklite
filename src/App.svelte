<script lang="ts">
  import { onMount } from 'svelte';
  import { GameEngine } from './game/engine';
  import { CanvasRenderer } from './render/renderer';
  import { OPS } from './game/operators';
  import { clamp } from './game/geometry';
  import type { OpKind, UiSnapshot } from './game/types';

  import Hud from './components/Hud.svelte';
  import Dock from './components/Dock.svelte';
  import CardInfoModal from './components/CardInfoModal.svelte';
  import OpInfoPanel from './components/OpInfoPanel.svelte';
  import StartOverlay from './components/StartOverlay.svelte';
  import type { SelInfo } from './ui-types';

  const engine = new GameEngine();
  let renderer: CanvasRenderer;
  let canvasEl: HTMLCanvasElement;
  let stageEl: HTMLDivElement;
  let dragging = false;

  // 反应式 UI 状态
  let ui = $state<UiSnapshot>(engine.snapshot());
  let selInfo = $state<SelInfo | null>(null);
  let cardKind = $state<OpKind | null>(null);

  const wave = $derived(`${ui.spawnIdx}/${ui.totalSpawns}`);
  const canAffordCard = $derived(
    cardKind ? ui.started && !ui.over && ui.cost >= OPS[cardKind].cost : false,
  );

  function syncUi(): void {
    ui = engine.snapshot();
    const op = engine.selected;
    selInfo = op
      ? {
          name: op.def.name, color: op.def.color,
          hp: Math.ceil(op.hp), maxhp: op.maxhp,
          ratio: clamp(op.hp / op.maxhp, 0, 1),
          atk: op.def.atk, interval: op.def.interval,
          support: op.def.support, block: op.melee ? op.def.block : null,
        }
      : null;
  }

  function resize(): void {
    if (!renderer || !stageEl) return;
    renderer.resize(engine.level, stageEl.clientWidth - 8, stageEl.clientHeight - 8);
  }

  // ---------- 输入 ----------
  function onPointerDown(ev: PointerEvent): void {
    if (!engine.started || engine.over) return;
    const cell = renderer.screenToCell(ev.clientX, ev.clientY);
    if (engine.placing) {
      if (cell && engine.beginPending(cell.r, cell.c)) {
        dragging = true;
        try { canvasEl.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
      } else {
        engine.cancelPlacing();
      }
      syncUi();
      return;
    }
    if (!cell) { engine.deselect(); syncUi(); return; }
    engine.selectAt(cell.r, cell.c);
    syncUi();
  }

  function onPointerMove(ev: PointerEvent): void {
    if (!dragging || !engine.pending) return;
    const p = engine.pending;
    const v = renderer.vectorCells(ev.clientX, ev.clientY, p.r, p.c);
    engine.setPendingFacing(v.dx, v.dy);
  }

  function onPointerUp(): void {
    if (dragging && engine.pending) { engine.commitPending(); syncUi(); }
    dragging = false;
  }

  // ---------- 按钮回调 ----------
  const start = () => { engine.start(); cardKind = null; resize(); syncUi(); };
  const retry = () => { engine.restartLevel(); cardKind = null; resize(); syncUi(); };
  const next = () => { engine.nextLevel(); cardKind = null; resize(); syncUi(); };
  const pause = () => { engine.togglePause(); syncUi(); };
  const speed = () => { engine.cycleSpeed(); syncUi(); };
  const openCard = (k: OpKind) => { cardKind = k; };
  const closeCard = () => { cardKind = null; };
  const deploy = () => { if (cardKind) { engine.setPlacing(cardKind); cardKind = null; syncUi(); } };
  const retreat = () => { engine.retreatSelected(); syncUi(); };
  const deselect = () => { engine.deselect(); syncUi(); };

  onMount(() => {
    renderer = new CanvasRenderer(canvasEl);
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stageEl);
    window.addEventListener('resize', resize);

    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      let dt = (now - last) / 1000;
      last = now;
      dt = Math.min(dt, 0.05);
      engine.update(dt);
      renderer.draw(engine, dt);
      syncUi();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', resize);
    };
  });
</script>

<div id="app">
  <Hud
    cost={ui.cost} life={ui.life} {wave} speed={ui.speed}
    levelLabel={`${ui.levelIndex + 1}-${ui.levelName}`}
    running={ui.running} started={ui.started} over={ui.over}
    onPause={pause} onSpeed={speed} onRestart={retry}
  />

  <div id="stage" bind:this={stageEl}>
    <canvas
      bind:this={canvasEl}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
    ></canvas>

    {#if selInfo}
      <OpInfoPanel info={selInfo} onRetreat={retreat} onClose={deselect} />
    {/if}

    {#if cardKind}
      <CardInfoModal
        def={OPS[cardKind]} canAfford={canAffordCard} started={ui.started}
        onClose={closeCard} onDeploy={deploy}
      />
    {/if}

    {#if !ui.started || ui.over}
      <StartOverlay
        started={ui.started} over={ui.over} won={ui.won}
        total={ui.totalSpawns} stars={ui.stars} leaked={ui.leaked}
        levelLabel={`第 ${ui.levelIndex + 1} / ${ui.levelCount} 关 · ${ui.levelName}`}
        levelHint={ui.levelHint}
        hasNext={ui.hasNextLevel}
        onStart={start} onRetry={retry} onNext={next}
      />
    {/if}
  </div>

  <Dock affordable={(k) => engine.affordable(k)} placingKind={ui.placingKind} onCard={openCard} />
</div>
