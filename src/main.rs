use bevy::prelude::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(CameraPlugin)
        .add_plugins(BallPlugin)
        .run();
}

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

#[derive(Component)]
struct Ball;

fn add_ball(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ColorMaterial>>,
) {
    let circle = meshes.add(Circle::new(50.0));
    let color = materials.add(Color::hsl(0.0, 0.95, 0.7));
    commands.spawn((
        Mesh2d(circle),
        MeshMaterial2d(color),
        Transform::from_xyz(0.0, 0.0, 0.0),
        Ball,
    ));
}

fn move_ball(time: Res<Time>, mut positions: Query<&mut Transform, With<Ball>>) {
    let t = time.elapsed_secs();
    let tau = std::f32::consts::TAU;
    for mut transform in &mut positions {
        transform.translation.x = 100.0 * (tau * t).sin();
    }
}

pub struct BallPlugin;

impl Plugin for BallPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, add_ball);
        app.add_systems(Update, move_ball);
    }
}
