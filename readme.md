# Bevy testing ground

when building and serving wasm builds from the desktop you need to have the dev server serve to all devices on the local net

```sh
export WASM_SERVER_RUNNER_ADDRESS=0.0.0.0
```

to build and serve

```sh
cargo run --target wasm32-unknown-unknown
```

To run on a device on the same network, connect to (http://desktop.local:1334)

