<script lang="ts">
  import type { SelInfo } from '../ui-types';

  let {
    info, onRetreat, onClose,
  }: {
    info: SelInfo;
    onRetreat: () => void;
    onClose: () => void;
  } = $props();

  const hpColor = $derived(info.ratio > 0.5 ? '#4caf50' : info.ratio > 0.25 ? '#e6b800' : '#e05050');
</script>

<div id="opInfo">
  <div class="row">
    <span class="oiName" style="color:{info.color}">{info.name}</span>
    <button class="xbtn" onclick={onClose} aria-label="关闭">×</button>
  </div>
  <div class="row" style="margin-top:6px">
    <div class="oiBar">
      <div class="oiHpFill" style="width:{info.ratio * 100}%;background:{hpColor}"></div>
    </div>
    <span class="oiHpTxt">HP {info.hp}/{info.maxhp}</span>
  </div>
  <div class="oiStats">
    <span>{info.support ? '治疗' : '攻击力'} <b>{info.atk}</b></span>
    <span>攻击间隔 <b>{info.interval}s</b></span>
    <span>阻挡 <b>{info.block ?? '—'}</b></span>
  </div>
  <button class="btn" style="width:100%" onclick={onRetreat}>撤退</button>
</div>
