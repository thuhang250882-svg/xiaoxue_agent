# Xiaoxue pet assets

Runtime assets are served from `packages/app/public/assets/`.

- `xiaoxue.glb`: preferred Three.js model.
- `xiaoxue_front_full.png`: front full-body fallback.
- `xiaoxue_side_right.png`: side fallback.
- `xiaoxue_back_full.png`: back fallback.
- `xiaoxue_three_quarter_left.png` and `xiaoxue_three_quarter_right.png`: thinking/searching views.
- `xiaoxue_side_profile.png`: alternate side view.
- `xiaoxue_portrait.png`: compact portrait.

The GLB remains the primary renderer. Multi-angle images keep the pet usable when a GLB is missing, damaged, or has no suitable animation clips.
