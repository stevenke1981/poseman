# PoseMan default human provenance

- Upstream: [Mesh2Motion/mesh2motion-app](https://github.com/Mesh2Motion/mesh2motion-app)
- Pinned file commit: `05fadfd7a513d45e8b7504e84de5c3497d73c9d0`
- Pinned source: `static/models-variation/human-female.glb`
- Bundled path: `public/templates/poseman-default-human.glb`
- Exact size: `1358928` bytes
- SHA-256: `2b1c47e5eeebffd5097eb8a52add4ba6556dab85e50fc1c5240d744099bebae1`
- License evidence: upstream [`LICENSE-CC0.MD`](https://github.com/Mesh2Motion/mesh2motion-app/blob/05fadfd7a513d45e8b7504e84de5c3497d73c9d0/LICENSE-CC0.MD) states the 3D models, rigs, and animations are CC0; the upstream README also identifies the art license as CC0.
- Bundled license evidence: [`poseman-default-human.LICENSE-CC0.md`](./poseman-default-human.LICENSE-CC0.md) is the pinned upstream license text.

The binary is bundled unchanged at the pinned commit. The app does not fetch it at runtime from GitHub. Empty scenes load the local `/templates/poseman-default-human.glb` copy. To intentionally refresh or reproduce the bundle, run the opt-in command below and review the resulting hash before changing the checked-in asset:

```bash
node scripts/fetch_default_human.mjs --write
```

PoseMan still asks the user to confirm licensing metadata when importing any file, including a downloaded copy that has been edited or re-exported.
