/**
 * Pet Animation Styles
 *
 * CSS keyframe animations for all pet states.
 * Import this file in the pet overlay component.
 */

// Animation styles are injected as a style tag in the component.
// This is because SolidJS handles CSS modules differently.

export const PET_ANIMATION_STYLES = `
  /* ─── Idle: gentle breathing ─── */
  @keyframes pet-idle-breathe {
    0%, 100% { transform: scale(1) translateY(0); }
    50% { transform: scale(1.01) translateY(-1px); }
  }

  /* ─── Listen: head tilt ─── */
  @keyframes pet-listen-tilt {
    0%, 100% { transform: rotate(0deg) scale(1.05); }
    25% { transform: rotate(3deg) scale(1.05); }
    75% { transform: rotate(-3deg) scale(1.05); }
  }

  /* ─── Thinking: pulse glow ─── */
  @keyframes pet-thinking-pulse {
    0%, 100% { transform: scale(1.02); filter: brightness(1); }
    50% { transform: scale(1.04); filter: brightness(1.1); }
  }

  /* ─── Searching: scan ─── */
  @keyframes pet-searching-scan {
    0%, 100% { transform: translateX(0) scale(1); }
    25% { transform: translateX(2px) scale(1); }
    75% { transform: translateX(-2px) scale(1); }
  }

  /* ─── Reading: gentle bob ─── */
  @keyframes pet-reading-bob {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-2px) scale(1); }
  }

  /* ─── Writing: active ─── */
  @keyframes pet-writing-active {
    0%, 100% { transform: translateX(0) scale(1); }
    20% { transform: translateX(1px) scale(1); }
    40% { transform: translateX(-1px) scale(1); }
    60% { transform: translateX(1px) scale(1); }
    80% { transform: translateX(0) scale(1); }
  }

  /* ─── Reviewing: focused ─── */
  @keyframes pet-reviewing-focus {
    0%, 100% { transform: scale(1.03); }
    50% { transform: scale(1.05); }
  }

  /* ─── Success: celebrate ─── */
  @keyframes pet-success-celebrate {
    0% { transform: scale(1.1) translateY(0); }
    25% { transform: scale(1.15) translateY(-3px); }
    50% { transform: scale(1.1) translateY(0); }
    75% { transform: scale(1.12) translateY(-1px); }
    100% { transform: scale(1.1) translateY(0); }
  }

  /* ─── Warning: alert shake ─── */
  @keyframes pet-warning-alert {
    0%, 100% { transform: translateX(0); }
    10% { transform: translateX(-2px); }
    20% { transform: translateX(2px); }
    30% { transform: translateX(-2px); }
    40% { transform: translateX(2px); }
    50% { transform: translateX(0); }
  }

  /* ─── Error: distress ─── */
  @keyframes pet-error-distress {
    0%, 100% { transform: scale(0.98); opacity: 1; }
    50% { transform: scale(0.96); opacity: 0.85; }
  }

  /* ─── Glow ring animation ─── */
  @keyframes pet-glow-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }

  /* ─── Menu entrance ─── */
  @keyframes pet-menu-enter {
    from { opacity: 0; transform: translateY(8px) scale(0.95); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* ─── Avatar float (idle) ─── */
  @keyframes pet-avatar-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }

  /* ─── State transition flash ─── */
  @keyframes pet-transition-flash {
    0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4); }
    50% { box-shadow: 0 0 20px 4px rgba(255, 255, 255, 0.2); }
    100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
  }

  /* ─── Particle fade ─── */
  @keyframes pet-particle-fade {
    from { opacity: 0; transform: translateY(10px) scale(0); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
`
