<script setup lang="ts">
defineProps<{
  eyebrow: string
  title: string
  description: string
}>()
</script>

<template>
  <section class="auth-story" aria-labelledby="auth-story-title">
    <div class="auth-orbit" aria-hidden="true">
      <span class="auth-orbit-ring ring-one"></span>
      <span class="auth-orbit-ring ring-two"></span>
      <span class="auth-star auth-star-teen"></span>
      <span class="auth-star auth-star-parent"></span>
      <span class="auth-star-core"></span>
      <span class="auth-orbit-trace"></span>
    </div>
    <div class="auth-story-copy">
      <p>{{ eyebrow }}</p>
      <h1 id="auth-story-title">{{ title }}</h1>
      <div class="auth-story-rule"><span></span></div>
      <p>{{ description }}</p>
    </div>
    <blockquote>“愿每一次坦诚，都能被温柔地接住。”</blockquote>
  </section>
</template>

<style scoped>
.auth-story {
  position: relative;
  display: grid;
  min-height: 100vh;
  align-content: center;
  padding: clamp(72px, 9vw, 128px) clamp(34px, 7vw, 112px);
  overflow: hidden;
  border-right: 1px solid var(--line-subtle);
  background:
    radial-gradient(circle at 44% 38%, color-mix(in oklch, var(--color-indigo) 18%, transparent), transparent 31rem),
    linear-gradient(145deg, color-mix(in oklch, var(--color-patina) 6%, transparent), transparent 50%);
}

.auth-story::before {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, color-mix(in oklch, var(--color-ink) 27%, transparent) 0 0.7px, transparent 0.9px);
  background-size: 47px 47px;
  content: '';
  opacity: 0.2;
}

.auth-orbit {
  position: relative;
  width: min(33vw, 410px);
  aspect-ratio: 1;
  margin: 0 auto clamp(34px, 5vh, 58px);
}

.auth-orbit-ring {
  position: absolute;
  inset: 17%;
  border: 1px solid color-mix(in oklch, var(--color-cyan) 34%, transparent);
  border-radius: 50%;
  transform: rotate(-21deg) scaleY(0.45);
}

.ring-two {
  inset: 7%;
  border-color: color-mix(in oklch, var(--color-violet) 22%, transparent);
  transform: rotate(38deg) scaleY(0.68);
}

.auth-star,
.auth-star-core {
  position: absolute;
  border-radius: 50%;
}

.auth-star-core {
  top: 50%;
  left: 50%;
  width: 31%;
  aspect-ratio: 1;
  background:
    radial-gradient(circle at 36% 32%, #ffd1bd 0, var(--color-coral) 12%, transparent 34%),
    radial-gradient(circle at 68% 68%, var(--color-cyan), transparent 42%),
    var(--color-indigo);
  box-shadow: 0 0 72px color-mix(in oklch, var(--color-indigo) 45%, transparent), inset -15px -18px 32px rgb(7 8 20 / 42%);
  transform: translate(-50%, -50%);
}

.auth-star-core::after {
  position: absolute;
  inset: -25%;
  border: 1px solid color-mix(in oklch, var(--color-coral) 24%, transparent);
  border-radius: 47% 53% 45% 55%;
  content: '';
  transform: rotate(28deg);
}

.auth-star-teen {
  top: 21%;
  right: 12%;
  width: 12px;
  height: 12px;
  background: var(--color-cyan);
  box-shadow: 0 0 20px var(--color-cyan);
}

.auth-star-parent {
  bottom: 20%;
  left: 11%;
  width: 15px;
  height: 15px;
  background: var(--color-coral);
  box-shadow: 0 0 24px var(--color-coral);
}

.auth-orbit-trace {
  position: absolute;
  top: 9%;
  left: 19%;
  width: 18%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--color-patina));
  transform: rotate(-34deg);
}

.auth-story-copy,
.auth-story blockquote {
  position: relative;
  z-index: 1;
}

.auth-story-copy > p:first-child {
  margin: 0 0 14px;
  color: var(--color-patina);
  font-family: var(--font-mono);
  font-size: 14px;
  letter-spacing: 0.1em;
}

.auth-story h1 {
  max-width: 8em;
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(42px, 4.4vw, 70px);
  font-weight: 500;
  letter-spacing: -0.025em;
  line-height: 1.2;
}

.auth-story-rule {
  display: flex;
  width: min(300px, 70%);
  align-items: center;
  margin: 28px 0 22px;
}

.auth-story-rule::before {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-coral);
  box-shadow: 0 0 10px var(--color-coral);
  content: '';
}

.auth-story-rule span {
  height: 1px;
  flex: 1;
  background: linear-gradient(90deg, var(--color-coral), transparent);
}

.auth-story-copy > p:last-child {
  max-width: 35em;
  margin: 0;
  color: var(--color-muted);
  font-size: 16px;
  line-height: 1.9;
}

.auth-story blockquote {
  margin: 34px 0 0;
  color: var(--color-faint);
  font-family: var(--font-display);
  font-size: 14px;
}

@media (max-width: 900px) {
  .auth-story {
    min-height: auto;
    padding: 70px 24px 42px;
    border-right: 0;
    border-bottom: 1px solid var(--line-subtle);
  }

  .auth-orbit {
    position: absolute;
    top: 32px;
    right: -72px;
    width: 260px;
    margin: 0;
    opacity: 0.68;
  }

  .auth-story h1 {
    font-size: clamp(38px, 9vw, 56px);
  }

  .auth-story-copy > p:last-child {
    max-width: 30em;
    padding-right: 12vw;
  }

  .auth-story blockquote {
    display: none;
  }
}
</style>
