# Xiaoxue pet assets

Runtime assets are served from `packages/app/public/assets/pet/`.

The pet uses transparent animated WebP files exclusively. Every agent state is
mapped by `XiaoxueWebP.tsx`, which also keeps the character aligned to a stable
body and feet anchor when animations have different transparent padding or
asymmetric visual effects.