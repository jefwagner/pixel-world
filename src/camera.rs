use bevy::prelude::*;
use bevy::window::{PrimaryWindow, Window};

#[derive(Component)]
struct CameraMarker;

fn setup_camera(mut commands: Commands) {
    commands.spawn((Camera2d::default(), CameraMarker));
}

pub struct CameraPlugin;

impl Plugin for CameraPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, setup_camera);
    }
}

#[cfg(target_arch = "wasm32")]
fn handle_browser_resize(mut primary_query: Query<&mut Window, With<PrimaryWindow>>) {
    let Some(wasm_window) = web_sys::window() else {
        return;
    };
    let Ok(inner_width) = wasm_window.inner_width() else {
        return;
    };
    let Ok(inner_height) = wasm_window.inner_height() else {
        return;
    };
    let Some(target_width) = inner_width.as_f64() else {
        return;
    };
    let Some(target_height) = inner_height.as_f64() else {
        return;
    };
    for mut window in &mut primary_query {
        if window.resolution.width() != (target_width as f32)
            || window.resolution.height() != (target_height as f32)
        {
            window
                .resolution
                .set(target_width as f32, target_height as f32);
        }
    }
}

pub struct WindowResizePlugin;

impl Plugin for WindowResizePlugin {
    #[cfg(target_arch = "wasm32")]
    fn build(&self, app: &mut App) {
        app.add_systems(Update, handle_browser_resize);
    }

    #[cfg(not(target_arch = "wasm32"))]
    fn build(&self, _app: &mut App) {}
}
