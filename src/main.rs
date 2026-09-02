use avian2d::{math::*, prelude::*};
use bevy::prelude::*;
// use wasm_bindgen::prelude::*;

pub const SCREEN: Vec2 = Vec2 { x: 126.0, y: 168.0 };

mod camera;
use camera::{CameraPlugin, WindowResizePlugin};

mod thick_line;
use thick_line::ThickLine;

#[cfg(not(target_arch = "wasm32"))]
use colog;
#[cfg(target_arch = "wasm32")]
use console_log;

// #[wasm_bindgen(start)]
fn main() {
    #[cfg(target_arch = "wasm32")]
    console_log::init_with_level(log::Level::Warn)
        .expect("Could not initialize wasm console logger");
    #[cfg(not(target_arch = "wasm32"))]
    {
        let mut clog = colog::default_builder();
        clog.filter(None, log::LevelFilter::Warn);
        clog.init();
    }

    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(WindowResizePlugin)
        .add_plugins(CameraPlugin)
        .add_plugins(PhysicsPlugins::default().with_length_unit(10.0))
        .insert_resource(Gravity(Vector::NEG_Y * 500.0))
        .add_plugins(BallPlugin)
        .run();
}

fn add_walls(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ColorMaterial>>,
) {
    // Add an outline surrounding the screen
    let mut points = vec![];
    points.push(Vec2::new(-58.0, -(50.0 + 29.0)));
    let n = 100;
    for i in 0..(n + 1) {
        let th = std::f32::consts::PI * (i as f32) / (n as f32);
        let x = -58.0 * th.cos();
        let y = (50.0 - 29.0) + 58.0 * th.sin();
        points.push(Vec2::new(x, y));
    }
    points.push(Vec2::new(58.0, -(50.0 + 29.0)));
    let t: f32 = 5.0;
    let line = ThickLine::new(points, t, true);
    //let wx = SCREEN.x/2.0 - t;
    //let wy = SCREEN.y/2.0 - t;
    //let line = ThickLine::new(
    //    vec![
    //        Vec2::new(-wx, -wy),
    //        Vec2::new(-wx, wy),
    //        Vec2::new(wx, wy),
    //        Vec2::new(wx, -wy),
    //    ],
    //    t,
    //    true,
    //);
    let collider = line.collider_polyline();
    let line_shape = meshes.add(line);
    let line_color = materials.add(Color::hsl(180.0, 0.95, 0.3));
    commands.spawn((
        Mesh2d(line_shape),
        MeshMaterial2d(line_color.clone()),
        RigidBody::Static,
        Collider::polyline(collider, None),
        Restitution::new(0.75).with_combine_rule(CoefficientCombine::Min),
        Friction::new(0.1).with_combine_rule(CoefficientCombine::Multiply),
    ));

    let points = vec![
        Vec2::new(-8.0 + 50.0 + 6.0, -(50.0 + 29.0)),
        Vec2::new(-8.0 + 50.0 + 6.0, 40.0 - 29.0),
        Vec2::new(-8.0 + 50.0, 40.0 - 29.0),
        Vec2::new(-8.0 + 50.0, -(50.0 + 29.0)),
    ];
    let line = ThickLine::new(points, 3.0, false);
    let collider = line.collider_polyline();
    let line_shape = meshes.add(line);
    commands.spawn((
        Mesh2d(line_shape),
        MeshMaterial2d(line_color.clone()),
        RigidBody::Static,
        Collider::polyline(collider, None),
        Restitution::new(0.75).with_combine_rule(CoefficientCombine::Min),
        Friction::new(0.1).with_combine_rule(CoefficientCombine::Multiply),
    ));
}

#[derive(Component)]
struct Ball;

// const NUM_BALLS: usize = 1;

fn add_balls(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ColorMaterial>>,
) {
    let radius = 4.0;
    let circle = meshes.add(Circle::new(radius));
    // let mut colors = vec![];
    // let hue_spacing: f32 = 360.0 / (NUM_BALLS as f32);
    // for i in 0..NUM_BALLS {
    //     colors.push(materials.add(Color::hsl(i as f32 * hue_spacing, 0.95, 0.7)));
    // }
    let color = materials.add(Color::hsl(0.0, 0.95, 0.7));

    commands.spawn((
        Mesh2d(circle),
        MeshMaterial2d(color),
        Transform::from_xyz(0.0 - 8.0 + 50.0 + 6.0 + 5.0, -50.0 - 31.5 + 30.0, 0.0),
        RigidBody::Dynamic,
        Collider::circle(radius as Scalar),
        Restitution::new(0.95).with_combine_rule(CoefficientCombine::Min),
        Friction::new(0.1).with_combine_rule(CoefficientCombine::Multiply),
        Ball,
    ));

    //let mut i = 0;
    //let per_row = if NUM_BALLS % 2 == 0 {
    //    NUM_BALLS / 2
    //} else {
    //    (NUM_BALLS + 1) / 2
    //};
    //for x in 0..per_row {
    //    for y in 0..2 {
    //        if i < NUM_BALLS {
    //            commands.spawn((
    //                Mesh2d(circle.clone()),
    //                MeshMaterial2d(colors[i].clone()),
    //                Transform::from_xyz(x as f32 * 2.5 * radius, y as f32 * 2.5 * radius, 0.0),
    //                RigidBody::Dynamic,
    //                Collider::circle(radius as Scalar),
    //                Restitution::new(0.95).with_combine_rule(CoefficientCombine::Min),
    //                Ball,
    //            ));
    //        }
    //        i += 1;
    //    }
    //}
}

fn move_balls(
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    mut velocities: Query<&mut LinearVelocity, With<Ball>>,
) {
    let dt = time.delta_secs();

    for mut v in &mut velocities {
        if keys.any_pressed([KeyCode::KeyW, KeyCode::ArrowUp]) {
            v.y += 5.0 * 250.0 * dt;
        }
        if keys.any_pressed([KeyCode::KeyS, KeyCode::ArrowDown]) {
            v.y -= 5.0 * 50.0 * dt;
        }
        if keys.any_pressed([KeyCode::KeyA, KeyCode::ArrowLeft]) {
            v.x -= 5.0 * 50.0 * dt;
        }
        if keys.any_pressed([KeyCode::KeyD, KeyCode::ArrowRight]) {
            v.x += 5.0 * 50.0 * dt;
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
