<script lang="ts">
  /**
   * Live breathing-glass aurora — the brand surface that mirrors the toolbar
   * icon. Pure CSS mesh (blurred radial blobs drifting on Lissajous-ish
   * keyframes) under a glass sheen. No JS rAF, so it's effectively free in the
   * popup DOM where the icon's MV3-worker cost doesn't apply.
   *
   * `active` speeds + widens the drift (work in progress); idle is slow and
   * calm. Reduced-motion freezes the blobs into a composed still — still
   * beautiful, zero motion.
   */
  import type { Snippet } from 'svelte';

  interface Props {
    /** Intensify + accelerate the flow (background work running). */
    active?: boolean;
    height?: string;
    radius?: string;
    children?: Snippet;
  }
  let { active = false, height = '78px', radius = 'var(--radius-lg)', children }: Props =
    $props();
</script>

<div class="aurora" class:active style="--h:{height}; --r:{radius}">
  <div class="mesh" aria-hidden="true">
    <span class="blob b1"></span>
    <span class="blob b2"></span>
    <span class="blob b3"></span>
    <span class="blob b4"></span>
  </div>
  <div class="glass" aria-hidden="true"></div>
  <!-- Scrim: guarantees text contrast over the moving mesh. Darkest on the
       left where the wordmark sits — never trust white over a live gradient. -->
  <div class="scrim" aria-hidden="true"></div>
  {#if children}
    <div class="content">{@render children()}</div>
  {/if}
</div>

<style>
  .aurora {
    position: relative;
    height: var(--h);
    border-radius: var(--r);
    overflow: hidden;
    isolation: isolate;
    background: #06201e;
    box-shadow:
      0 8px 26px -14px rgba(45, 212, 191, 0.4),
      inset 0 1px 0 0 rgba(255, 255, 255, 0.06);
  }

  .mesh {
    position: absolute;
    inset: -35%;
    filter: blur(28px) saturate(140%);
    z-index: 0;
  }

  .blob {
    position: absolute;
    width: 56%;
    height: 78%;
    border-radius: 50%;
    mix-blend-mode: screen;
    will-change: transform;
  }
  .b1 {
    left: 4%;
    top: 6%;
    background: #2dd4bf; /* jade */
    opacity: 0.7;
    animation: drift1 9s ease-in-out infinite;
  }
  .b2 {
    right: 2%;
    bottom: -6%;
    background: #14b8a6; /* teal */
    opacity: 0.68;
    animation: drift2 11s ease-in-out infinite;
  }
  .b3 {
    right: 16%;
    top: -2%;
    background: #0f766e; /* emerald — depth */
    opacity: 0.62;
    animation: drift3 13s ease-in-out infinite;
  }
  .b4 {
    left: 8%;
    bottom: 0%;
    background: #6ee7b7; /* mint highlight */
    opacity: 0.45;
    animation: drift4 10s ease-in-out infinite;
  }

  /* Active = work in progress: faster + a touch brighter, wider travel. */
  .active .b1 {
    animation-duration: 4.2s;
    opacity: 0.82;
  }
  .active .b2 {
    animation-duration: 5s;
    opacity: 0.8;
  }
  .active .b3 {
    animation-duration: 5.6s;
  }
  .active .b4 {
    animation-duration: 4.6s;
    opacity: 0.6;
  }

  .glass {
    position: absolute;
    inset: 0;
    z-index: 1;
    background:
      linear-gradient(
        135deg,
        rgba(255, 255, 255, 0.2) 0%,
        rgba(255, 255, 255, 0.03) 38%,
        transparent 62%
      ),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.24) 0%, transparent 16%),
      linear-gradient(to top, rgba(6, 32, 30, 0.4) 0%, transparent 42%);
  }

  .scrim {
    position: absolute;
    inset: 0;
    z-index: 1;
    background:
      linear-gradient(
        to right,
        rgba(6, 32, 30, 0.8) 0%,
        rgba(6, 32, 30, 0.4) 46%,
        rgba(6, 32, 30, 0) 82%
      ),
      linear-gradient(to top, rgba(6, 32, 30, 0.45) 0%, transparent 55%);
  }

  .content {
    position: relative;
    z-index: 2;
    height: 100%;
  }

  @keyframes drift1 {
    0%,
    100% {
      transform: translate(0, 0) scale(1);
    }
    50% {
      transform: translate(20%, 14%) scale(1.16);
    }
  }
  @keyframes drift2 {
    0%,
    100% {
      transform: translate(0, 0) scale(1.05);
    }
    50% {
      transform: translate(-18%, -10%) scale(0.92);
    }
  }
  @keyframes drift3 {
    0%,
    100% {
      transform: translate(0, 0) scale(1);
    }
    50% {
      transform: translate(-14%, 18%) scale(1.2);
    }
  }
  @keyframes drift4 {
    0%,
    100% {
      transform: translate(0, 0) scale(1);
    }
    50% {
      transform: translate(16%, -14%) scale(1.1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .blob {
      animation: none !important;
    }
  }
</style>
