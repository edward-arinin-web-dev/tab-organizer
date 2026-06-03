<script lang="ts">
  /**
   * Static mini aurora mark — the DOM echo of the toolbar icon. A small jade
   * squircle with a layered radial mesh + glass rim. Cheap (no animation, no
   * heavy blur), crisp at logo sizes. Use anywhere the brand needs a face:
   * side-panel header, options, about.
   */
  interface Props {
    size?: number;
  }
  let { size = 24 }: Props = $props();
  const radius = $derived(Math.round(size * 0.29));
</script>

<span
  class="logo"
  style="--s:{size}px; --r:{radius}px"
  aria-hidden="true"
></span>

<style>
  .logo {
    display: inline-block;
    width: var(--s);
    height: var(--s);
    border-radius: var(--r);
    background:
      radial-gradient(circle at 30% 26%, #2dd4bf 0%, transparent 58%),
      radial-gradient(circle at 72% 76%, #14b8a6 0%, transparent 58%),
      radial-gradient(circle at 78% 28%, #0f766e 0%, transparent 52%),
      radial-gradient(circle at 24% 72%, #6ee7b7 0%, transparent 46%),
      #06201e;
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.16),
      inset 0 1px 0 0 rgba(255, 255, 255, 0.22),
      0 2px 9px -3px rgba(45, 212, 191, 0.55);
  }
</style>
