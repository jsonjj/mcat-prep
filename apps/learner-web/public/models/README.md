# Home brain 3D model (optional)

Drop a permissively-licensed brain model here as **`brain.glb`** and the Home hero
renders it with the glass/iridescent shader. If it's absent, a procedural glass
brain is used instead — nothing breaks either way.

## Licensing (non-negotiable, per the project's copyright rules)

- The model **must** be **CC0 / public domain**, or a license you hold the rights to.
- Add an `ATTRIBUTION.md` next to the model recording: source URL, author, license,
  and date. CC BY / CC BY-SA require keeping attribution with the asset.
- Prefer a watertight, single-mesh, **non-Draco** `.glb`, ideally < 8 MB.

Model binaries are **gitignored by default** so an unlicensed asset can't be
committed by accident. Once you've verified the license, force-add it deliberately:

```
git add -f apps/learner-web/public/models/brain.glb apps/learner-web/public/models/ATTRIBUTION.md
```

## Notes

- The loader auto-centers and auto-scales the model. If the orientation looks off,
  tell me and I'll set a default rotation.
- Candidates found (verify license yourself before use): NIH 3D "Detailed Human
  Brain Model" (entry 21161 — license was ambiguous, not used), Science Museum Group
  on Sketchfab (CC0 but very high-poly), Meshy AI brain tag (CC0 but account-gated).
