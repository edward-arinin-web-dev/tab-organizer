<!--
  ShimmerBar — thin horizontal gradient that sweeps left→right. Used as an
  ambient indicator that the engine is processing in the background.
-->
<script lang="ts">
  interface Props {
    /** When true, the shimmer is visible and animating. */
    active: boolean;
  }
  let { active }: Props = $props();
</script>

{#if active}
  <div class="shimmer-bar relative h-0.5 w-full overflow-hidden rounded-full bg-accent/10">
    <div class="shimmer-sweep absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-accent to-transparent"></div>
  </div>
{/if}

<style>
  .shimmer-sweep {
    animation: shimmer-sweep 1.4s linear infinite;
  }
  @keyframes shimmer-sweep {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(400%);
    }
  }
</style>
