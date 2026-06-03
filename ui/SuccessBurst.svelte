<!--
  SuccessBurst — radial ping + scaling check that fires when a job succeeds.
  Mounts when `active` becomes true; auto-clears after ~1.4s via $effect.
-->
<script lang="ts">
  interface Props {
    /** Render+animate once. Toggle to false then back to true to replay. */
    active: boolean;
    /** Optional inline message rendered next to the check. */
    message?: string;
  }
  let { active, message }: Props = $props();
</script>

{#if active}
  <div class="success-burst relative flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-xs">
    <span class="relative inline-flex items-center justify-center size-5 shrink-0">
      <span class="absolute inset-0 rounded-full bg-success/40 success-ping"></span>
      <span class="relative inline-flex items-center justify-center size-4 rounded-full bg-success text-white text-[10px] font-bold success-pop">✓</span>
    </span>
    {#if message}
      <span class="text-success-strong font-medium truncate">{message}</span>
    {/if}
  </div>
{/if}

<style>
  .success-ping {
    animation: success-ping 1.1s cubic-bezier(0, 0, 0.2, 1);
  }
  .success-pop {
    animation: success-pop 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes success-ping {
    0% {
      transform: scale(1);
      opacity: 0.8;
    }
    80%, 100% {
      transform: scale(2.4);
      opacity: 0;
    }
  }
  @keyframes success-pop {
    0% {
      transform: scale(0.4);
      opacity: 0;
    }
    60% {
      transform: scale(1.15);
      opacity: 1;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
  .success-burst {
    animation: burst-fade 1.4s ease-out forwards;
  }
  @keyframes burst-fade {
    0% { opacity: 0; transform: translateY(-4px); }
    15%, 80% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-2px); }
  }
</style>
