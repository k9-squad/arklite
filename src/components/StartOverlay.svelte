<script lang="ts">
  let {
    started, over, won, total, onStart,
  }: {
    started: boolean;
    over: boolean;
    won: boolean;
    total: number;
    onStart: () => void;
  } = $props();
</script>

<div id="overlay">
  {#if over}
    {#if won}
      <h1 style="color:#4caf50">防御成功！</h1>
      <p>你成功抵御了全部 {total} 个敌人的进攻。</p>
      <button class="btn big" onclick={onStart}>再来一局</button>
    {:else}
      <h1 style="color:#ff6b6b">防御失败</h1>
      <p>目标点被敌人攻陷了。再接再厉！</p>
      <button class="btn big" onclick={onStart}>重新开始</button>
    {/if}
  {:else if !started}
    <h1>方舟Lite</h1>
    <p>极简版明日方舟塔防。在<b style="color:#46506e">高台</b>上部署远程干员，在<b style="color:#3a3a4a">地面</b>上部署近战干员拦截敌人。别让敌人冲进<b style="color:#ff6b6b">蓝门(目标点)</b>！</p>
    <div class="tip">
      · 点击干员卡 → 查看详情 →「部署」<br />
      · 点击格子放下，<b>按住拖动可选择朝向</b>，松手确认<br />
      · <b style="color:var(--guard)">近卫</b>：阻挡1 · 范围1×2 · 高攻<br />
      · <b style="color:var(--def)">重装</b>：阻挡3 · 仅自身格 · 高血<br />
      · <b style="color:var(--sniper)">射手</b>：远程3×4 · 高攻速 · 脆皮<br />
      · <b style="color:var(--caster)">群法</b>：范围群攻 · 慢攻速 · 脆皮<br />
      · <b style="color:var(--medic)">医疗</b>：治疗友方 · 范围3×3+1<br />
      · 点击已部署干员可查看属性并撤退
    </div>
    <button class="btn big" onclick={onStart}>开始游戏</button>
  {/if}
</div>
