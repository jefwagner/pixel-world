use bevy::asset::RenderAssetUsages;
use bevy::prelude::*;
use bevy::render::mesh::{Indices, PrimitiveTopology};

use log::warn;

pub struct ThickLine {
    vertices: Vec<Vec2>,
    thickness: f32,
    closed: bool,
}

impl ThickLine {
    pub fn new(vertices: Vec<Vec2>, thickness: f32, closed: bool) -> Self {
        if vertices.len() == 2 && closed {
            warn!("Can not have a closed ThickLine with only two points.");
            Self {
                vertices,
                thickness,
                closed: false,
            }
        } else {
            Self {
                vertices,
                thickness,
                closed,
            }
        }
    }

    pub fn thickness(mut self, thickness: f32) -> Self {
        self.thickness = thickness;
        self
    }

    pub fn closed(mut self, closed: bool) -> Self {
        self.closed = closed;
        self
    }

    pub fn collider_polyline(&self) -> Vec<Vec2> {
        let mut vertices = self.vertices.clone();
        if self.closed {
            vertices.push(vertices[0]);
        }
        vertices
    }
}

impl Meshable for ThickLine {
    type Output = ThickLineMeshBuilder;

    fn mesh(&self) -> Self::Output {
        Self::Output {
            vertices: self.vertices.clone(),
            thickness: self.thickness,
            closed: self.closed,
        }
    }
}

pub struct ThickLineMeshBuilder {
    vertices: Vec<Vec2>,
    thickness: f32,
    closed: bool,
}

const EPS: f32 = 1.0e-10;

/// Find the point of two perpedicular offset lines from p0->p1 and p1->p2
//
// Method: the line from p0->p1 has a direction l0 = p1-p0 and goes through
// the point offset from p0' = p0 + l0.perp*t. All other points along the
// offset line can be found p0(u) = p0' + u*l0. A similar construction will
// give the points along the offset line from p1->p2 as p1(v) = p1' + v*l1.
//
// Setting these two equal to eachother gives an equation for the unknows
// u and v as the matrix equation: [l0 -l1].[u/v] = l0', where the vector
// l0' is the direction from the offset points p0'->p1'. We can find the
// unknown `u` Using Cramer's rule u = det[l0' -l1] / det[l0 -l1].
// Finally, the offset intersection will be p* = p0' + l0*u
fn offset_intersection(p0: Vec2, p1: Vec2, p2: Vec2, t: f32) -> Vec2 {
    // normailzed direction of lower line
    let l0 = (p1 - p0).normalize_or_zero();
    // normalized direction of upper line
    let l1 = (p2 - p1).normalize_or_zero();
    // denominator to use with Cramer's rule
    let denom = l0.perp_dot(-l1);
    // warn!("denom: {denom}");
    if denom.abs() < EPS {
        // if lines are parallel (or antiparallel) just use offset from midpoint
        p1 + l0.perp() * t
    } else {
        // get the offset points
        let p0p = p0 + l0.perp() * t;
        let p1p = p1 + l1.perp() * t;
        // get the direction between offset points
        let l0p = p1p - p0p;
        // numerator to use with Cramer's rule
        let num = l0p.perp_dot(-l1);
        // The u position of hte intersection
        let u = num / denom;
        // Position of intersection: p0' + l0 * u
        p0p + l0 * u
    }
}

impl MeshBuilder for ThickLineMeshBuilder {
    fn build(&self) -> Mesh {
        // for first and last point
        // offset point is perpendicular by distance thickness
        // for ever other point
        // look at two surrounding lines
        // if lines are parellel - perpendicular offset
        // othersiwe - intersecton of two offset lines
        //
        // Open:
        //
        // 0-2-4-
        // |/|/|
        // 1-3-5-
        //
        // n points -> triangle strip with 2*n vertices, 2*n-2 triangles
        //
        // Closed:
        //
        // 2-----4
        // |\   /|
        // | 3-5 |
        // | | | |
        // | 1-7 |
        // |/   \|
        // 0-----6
        //
        // n points -> triangle strip with 2*n+2 vertices, 2*n triangles
        //             first two and last two vertices are the same
        //
        // number of points in the line object
        let n0 = self.vertices.len();
        // number of points in the triangle strip
        let n = if self.closed { 2 * n0 + 2 } else { 2 * n0 };
        // create the positions, normals, and uv
        let mut positions: Vec<Vec3> = Vec::with_capacity(n);
        let normals = vec![[0.0, 0.0, 1.0]; n];
        let mut uvs: Vec<[f32; 2]> = Vec::with_capacity(n);
        // create the indices as list from 0 -> n-1
        let indices = {
            let mut indices = Vec::with_capacity(n);
            for i in 0..n {
                indices.push(i as u32);
            }
            Indices::U32(indices)
        };

        // 0 th point
        let zero: f32 = 0.0;
        positions.push((self.vertices[0], zero).into());
        uvs.push([0.0, 0.0]);
        // 1 th point
        let next = if self.closed {
            let p0 = self.vertices[n0 - 1];
            let p1 = self.vertices[0];
            let p2 = self.vertices[1];
            offset_intersection(p0, p1, p2, self.thickness)
        } else {
            let p0 = self.vertices[0];
            let p1 = self.vertices[1];
            let l = (p1 - p0).normalize_or_zero();
            p0 + l.perp() * self.thickness
        };
        positions.push((next, zero).into());
        uvs.push([0.0, 1.0]);

        for i in 1..(n0 - 1) {
            // 2*i-1 th point
            let u = (i as f32) / ((n / 2 - 1) as f32);
            positions.push((self.vertices[i], zero).into());
            uvs.push([u, 0.0]);
            // 2*i th point
            let next = {
                let p0 = self.vertices[i - 1];
                let p1 = self.vertices[i];
                let p2 = self.vertices[i + 1];
                offset_intersection(p0, p1, p2, self.thickness)
            };
            positions.push((next, zero).into());
            uvs.push([u, 1.0]);
        }

        if self.closed {
            let u = ((n0 - 1) as f32) / ((n / 2 - 1) as f32);
            positions.push((self.vertices[n0 - 1], zero).into());
            uvs.push([u, 0.0]);
            let next = {
                let p0 = self.vertices[n0 - 2];
                let p1 = self.vertices[n0 - 1];
                let p2 = self.vertices[0];
                offset_intersection(p0, p1, p2, self.thickness)
            };
            positions.push((next, zero).into());
            uvs.push([u, 1.0]);
            positions.push(positions[0]);
            positions.push(positions[1]);
        } else {
            positions.push((self.vertices[n0 - 1], zero).into());
            let last = {
                let p0 = self.vertices[n0 - 2];
                let p1 = self.vertices[n0 - 1];
                let l = (p1 - p0).normalize_or_zero();
                p1 + l.perp() * self.thickness
            };
            positions.push((last, zero).into());
        }
        uvs.push([1.0, 0.0]);
        uvs.push([1.0, 1.0]);

        Mesh::new(
            PrimitiveTopology::TriangleStrip,
            RenderAssetUsages::default(),
        )
        .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, positions)
        .with_inserted_attribute(Mesh::ATTRIBUTE_NORMAL, normals)
        .with_inserted_attribute(Mesh::ATTRIBUTE_UV_0, uvs)
        .with_inserted_indices(indices)
    }
}

impl From<ThickLine> for Mesh {
    fn from(thick_line: ThickLine) -> Self {
        ThickLineMeshBuilder {
            vertices: thick_line.vertices.clone(),
            thickness: thick_line.thickness,
            closed: thick_line.closed,
        }
        .build()
    }
}
