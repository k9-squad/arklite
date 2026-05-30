<script lang="ts">
  let {
    started, over, won, total, stars, leaked, levelLabel, levelHint, hasNext,
    onStart, onRetry, onNext,
  }: {
    started: boolean;
    over: boolean;
    won: boolean;
    total: number;
    stars: number;
    leaked: boolean;
    levelLabel: string;
    levelHint: string;
    hasNext: boolean;
    onStart: () => void;
    onRetry: () => void;
    onNext: () => void;
  } = $props();
</script>

<div id="overlay">
  {#if over}
    {#if won}
      <h1 style="color:#5fd16a">防御成功！</h1>
      <p class="lvltag">{levelLabel}</p>
      <div class="stars" aria-label={`${stars} 星`}>
        {#each [0, 1, 2] as i}
          <span class="star" class:on={i < stars}>★</span>
        {/each}
      </div>
      <p>{leaked ? `有敌人突破防线，获得 ${stars} 星` : `完美通关！无一漏怪，获得 ${stars} 星`}</p>
      {#if hasNext}
        <button class="btn big" onclick={onNext}>进入下一关 →</button>
        <button class="btn ghost" onclick={onRetry}>重打本关</button>
      {:else}
        <h2 style="color:#ffd54a;margin:4px 0 0">🏆 全部关卡通关！</h2>
        <button class="btn big" onclick={onStart}>从头再来</button>
      {/if}
    {:else}
      <h1 style="color:#ff6b6b">防御失败</h1>
      <p class="lvltag">{levelLabel}</p>
      <p>目标点被敌人攻陷了。再接再厉！</p>
      <button class="btn big" onclick={onRetry}>重新挑战</button>
      <button class="btn ghost" onclick={onStart}>回到第一关</button>
    {/if}
  {:else if !started}
    <h1>方舟Lite</h1>
    <p class="lvltag">{levelLabel}</p>
    <p>{levelHint}</p>
    <div class="tip">
      · 点击干员卡 → 查看详情 →「部署」<br />
      · 点击格子放下，<b>按住拖动可选择朝向</b>，松手确认<br />
      · <b style="color:var(--guard)">近卫</b>：阻挡1 · 1×2 · 高攻<br />
      · <b style="color:var(--def)">重装</b>：阻挡3 · 仅自身 · 高血<br />
      · <b style="color:var(--sniper)">射手</b>：远程3×4 · 高攻速 · 脆皮<br />
      · <b style="color:var(--caster)">群法</b>：3×3群攻 · 慢攻速 · 脆皮<br />
      · <b style="color:var(--medic)">医疗</b>：治疗友方 · 3×3+1<br />
      · 多条进攻路线时，注意分配防守兵力
    </div>
    <button class="btn big" onclick={onStart}>开始游戏</button>
  {/if}
</div>
