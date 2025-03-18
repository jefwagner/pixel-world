use avian2d::{math::*, prelude::*};
use bevy::prelude::*;
// use wasm_bindgen::prelude::*;

mod camera;
use camera::{CameraPlugin, WindowResizePlugin};

// #[wasm_bindgen(start)]
fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(WindowResizePlugin)
        .add_plugins(CameraPlugin)
        .add_plugins(PhysicsPlugins::default().with_length_unit(20.0))
        .insert_resource(Gravity(Vector::NEG_Y * 1000.0))
        .add_plugins(BallPlugin)
        .run();
}

fn add_walls(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ColorMaterial>>,
) {
    let shape = meshes.add(Rectangle::new(50.0, 50.0));
    let color = materials.add(Color::hsl(180.0, 0.95, 0.3));

    // ceiling
    commands.spawn((
        Mesh2d(shape.clone()),
        MeshMaterial2d(color.clone()),
        Transform::from_xyz(0.0, 50.0 * 6.0, 0.0).with_scale(Vec3::new(20.0, 1.0, 1.0)),
        RigidBody::Static,
        Collider::rectangle(50.0, 50.0),
        Restitution::new(1.0).with_combine_rule(CoefficientCombine::Min),
    ));
    // floor
    commands.spawn((
        Mesh2d(shape.clone()),
        MeshMaterial2d(color.clone()),
        Transform::from_xyz(0.0, -50.0 * 6.0, 0.0).with_scale(Vec3::new(20.0, 1.0, 1.0)),
        RigidBody::Static,
        Collider::rectangle(50.0, 50.0),
        Restitution::new(1.0).with_combine_rule(CoefficientCombine::Min),
    ));
    // left wall
    commands.spawn((
        Mesh2d(shape.clone()),
        MeshMaterial2d(color.clone()),
        Transform::from_xyz(-50.0 * 9.5, 0.0, 0.0).with_scale(Vec3::new(1.0, 11.0, 1.0)),
        RigidBody::Static,
        Collider::rectangle(50.0, 50.0),
        Restitution::new(1.0).with_combine_rule(CoefficientCombine::Min),
    ));
    // right wall
    commands.spawn((
        //        rect_sprite.clone(),
        Mesh2d(shape.clone()),
        MeshMaterial2d(color.clone()),
        Transform::from_xyz(50.0 * 9.5, 0.0, 0.0).with_scale(Vec3::new(1.0, 11.0, 1.0)),
        RigidBody::Static,
        Collider::rectangle(50.0, 50.0),
        Restitution::new(1.0).with_combine_rule(CoefficientCombine::Min),
    ));
}

#[derive(Component)]
struct Ball;

const NUM_BALLS: usize = 9;

fn add_balls(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ColorMaterial>>,
) {
    let radius = 15.0;
    let circle = meshes.add(Circle::new(radius));
    let mut colors = vec![];
    let hue_spacing: f32 = 360.0 / (NUM_BALLS as f32);
    for i in 0..NUM_BALLS {
        colors.push(materials.add(Color::hsl(i as f32 * hue_spacing, 0.95, 0.7)));
    }

    let mut i = 0;
    let per_row = if NUM_BALLS % 2 == 0 {
        NUM_BALLS / 2
    } else {
        (NUM_BALLS + 1) / 2
    };
    for x in 0..2 {
        for y in 0..per_row {
            if i < NUM_BALLS {
                commands.spawn((
                    Mesh2d(circle.clone()),
                    MeshMaterial2d(colors[i].clone()),
                    Transform::from_xyz(x as f32 * 2.5 * radius, y as f32 * 2.5 * radius, 0.0),
                    RigidBody::Dynamic,
                    Collider::circle(radius as Scalar),
                    Restitution::new(0.95).with_combine_rule(CoefficientCombine::Min),
                    Ball,
                ));
            }
            i += 1;
        }
    }
}

fn move_balls(
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    mut velocities: Query<&mut LinearVelocity, With<Ball>>,
) {
    let dt = time.delta_secs();

    for mut v in &mut velocities {
        if keys.any_pressed([KeyCode::KeyW, KeyCode::ArrowUp]) {
            v.y += 2500.0 * dt;
        }
        if keys.any_pressed([KeyCode::KeyS, KeyCode::ArrowDown]) {
            v.y -= 500.0 * dt;
        }
        if keys.any_pressed([KeyCode::KeyA, KeyCode::ArrowLeft]) {
            v.x -= 500.0 * dt;
        }
        if keys.any_pressed([KeyCode::KeyD, KeyCode::ArrowRight]) {
            v.x += 500.0 * dt;
        }
    }
}

pub struct BallPlugin;

impl Plugin for BallPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, (add_walls, add_balls));
        app.add_systems(Update, move_balls);
    }
}
