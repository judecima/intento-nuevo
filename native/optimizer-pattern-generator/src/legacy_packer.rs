use std::collections::{HashMap, HashSet};
use std::time::Instant;

use napi::{Error, Result, Status};
use napi_derive::napi;
use serde::{Deserialize, Serialize};

const EPS: f64 = 1e-9;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PieceInput {
    id: u32,
    base: f64,
    altura: f64,
    cut_base: f64,
    cut_altura: f64,
    veta: bool,
    sig: u32,
    #[serde(default)]
    detalle: String,
    #[serde(default)]
    ref_value: serde_json::Value,
}

#[derive(Debug, Clone, Copy)]
struct Piece {
    id: u32,
    sig: usize,
    orientations: [Orientation; 2],
    orientation_count: u8,
}

impl Piece {
    fn orientations(&self) -> &[Orientation] {
        &self.orientations[..self.orientation_count as usize]
    }
}

#[derive(Debug, Clone, Copy)]
struct Orientation {
    base: f64,
    altura: f64,
    rotada: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StructuralDelta {
    delta: f64,
    n: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackOptions {
    ancho_util: f64,
    alto_util: f64,
    sierra: f64,
    etapas: u32,
    material_con_veta: bool,
    criterio: String,
    #[serde(default)]
    criterios: Vec<String>,
    dir_inicial: String,
    ruido: f64,
    resto_min: f64,
    resto_max: f64,
    #[serde(default)]
    multi_rebanada: bool,
    #[serde(default)]
    penalizar_franja_muerta: bool,
    #[serde(default)]
    deltas_estructurales: Vec<StructuralDelta>,
    #[serde(default = "default_true")]
    contraer_rebanada_real: bool,
}

fn default_true() -> bool { true }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Axis { X, Y }

impl Axis {
    fn parse(value: &str) -> std::result::Result<Self, String> {
        match value {
            "x" => Ok(Self::X),
            "y" => Ok(Self::Y),
            _ => Err(format!("invalid dirInicial: {value}")),
        }
    }
    fn opposite(self) -> Self {
        match self { Self::X => Self::Y, Self::Y => Self::X }
    }
    fn as_str(self) -> &'static str {
        match self { Self::X => "x", Self::Y => "y" }
    }
}

#[derive(Debug, Clone, Copy)]
struct Region {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    dir: Axis,
}

impl Region {
    fn length(self) -> f64 { if self.dir == Axis::X { self.w } else { self.h } }
    fn perp(self) -> f64 { if self.dir == Axis::X { self.h } else { self.w } }
}

#[derive(Debug, Clone)]
struct Candidate {
    index: usize,
    orientation: Orientation,
    a: f64,
    b: f64,
    sobra: f64,
    exacta: u8,
    area: f64,
    mult: u32,
    riesgo_franja: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Placed {
    id: u32,
    x: f64,
    y: f64,
    base: f64,
    altura: f64,
    rotada: bool,
    nivel: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Cut {
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    nivel: u32,
    largo: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    terminal: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
struct Rest {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TreePart {
    cut: f64,
    #[serde(rename = "type")]
    kind: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    piece_id: Option<u32>,
    bloque: Rest,
    hijo: Box<TreeNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    terminal: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
struct TreeNode {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    dir: String,
    nivel: u32,
    partes: Vec<TreePart>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PackOutput {
    colocadas: Vec<Placed>,
    cortes: Vec<Cut>,
    restos: Vec<Rest>,
    arbol: TreeNode,
    area: f64,
    area_resto: f64,
}

struct Rng {
    state: u32,
}

impl Rng {
    fn new(seed: u32) -> Self { Self { state: seed } }
    fn next(&mut self) -> f64 {
        self.state = self.state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        self.state as f64 / 4_294_967_296.0
    }
}

fn make_piece(piece: &PieceInput, material_with_grain: bool) -> Piece {
    let base = Orientation { base: piece.cut_base, altura: piece.cut_altura, rotada: false };
    let rotated = Orientation { base: piece.cut_altura, altura: piece.cut_base, rotada: true };
    let single = (material_with_grain && piece.veta) || (piece.cut_base - piece.cut_altura).abs() < EPS;
    Piece {
        id: piece.id,
        sig: piece.sig as usize,
        orientations: [base, rotated],
        orientation_count: if single { 1 } else { 2 },
    }
}

fn prepare_pieces(inputs: &[PieceInput], material_with_grain: bool) -> Vec<Piece> {
    inputs.iter().map(|piece| make_piece(piece, material_with_grain)).collect()
}

struct PoolState {
    pieces: Vec<Piece>,
    counts: Vec<usize>,
    reps: Vec<Option<usize>>,
    next_same: Vec<Option<usize>>,
}

impl PoolState {
    fn new(template: &[Piece]) -> Self {
        let pieces = template.to_vec();
        let sig_count = pieces.iter().map(|piece| piece.sig).max().map(|x| x + 1).unwrap_or(0);
        let mut counts = vec![0usize; sig_count];
        let mut reps = vec![None; sig_count];
        let mut next_same = vec![None; pieces.len()];
        let mut next_by_sig = vec![None; sig_count];

        for index in (0..pieces.len()).rev() {
            let sig = pieces[index].sig;
            counts[sig] += 1;
            next_same[index] = next_by_sig[sig];
            next_by_sig[sig] = Some(index);
            reps[sig] = Some(index);
        }

        Self { pieces, counts, reps, next_same }
    }

    fn take(&mut self, index: usize) -> Piece {
        let piece = self.pieces[index];
        let sig = piece.sig;
        debug_assert_eq!(self.reps[sig], Some(index));
        debug_assert!(self.counts[sig] > 0);
        self.counts[sig] -= 1;
        self.reps[sig] = self.next_same[index];
        piece
    }
}

struct Scratch {
    reps: Vec<usize>,
    measures: Vec<f64>,
    top: Vec<Candidate>,
}

impl Scratch {
    fn new(pool: &PoolState) -> Self {
        let sig_count = pool.counts.len();
        Self {
            reps: Vec::with_capacity(sig_count),
            measures: Vec::with_capacity(sig_count.saturating_mul(2)),
            top: Vec::with_capacity(4),
        }
    }
}

fn better_fit(u: &Candidate, v: &Candidate, criterion: &str) -> bool {
    match criterion {
        "perp" => {
            if u.sobra != v.sobra { u.sobra < v.sobra }
            else if u.a != v.a { u.a > v.a }
            else { u.area > v.area }
        }
        "area" => {
            if u.area != v.area { u.area > v.area }
            else { u.sobra < v.sobra }
        }
        "largo" => {
            if u.a != v.a { u.a > v.a }
            else { u.sobra < v.sobra }
        }
        _ => {
            if u.exacta != v.exacta { u.exacta < v.exacta }
            else if u.sobra != v.sobra { u.sobra < v.sobra }
            else { u.area > v.area }
        }
    }
}

fn candidate_better(u: &Candidate, v: &Candidate, opts: &PackOptions, level: u32, criterion: &str) -> bool {
    if opts.penalizar_franja_muerta && level <= 2 {
        let ur = u.riesgo_franja;
        let vr = v.riesgo_franja;
        if (ur > 0.0) != (vr > 0.0) { return ur == 0.0; }
        if ur != vr { return ur < vr; }
    }
    better_fit(u, v, criterion)
}

fn choose(
    pool: &PoolState,
    region: Region,
    remaining: f64,
    perp: f64,
    opts: &PackOptions,
    mut rng: Option<&mut Rng>,
    level: u32,
    scratch: &mut Scratch,
) -> Option<Candidate> {
    let criterion = if !opts.criterios.is_empty() {
        &opts.criterios[usize::min(level.saturating_sub(1) as usize, opts.criterios.len() - 1)]
    } else {
        &opts.criterio
    };
    let en_x = region.dir == Axis::X;
    let Scratch { reps, measures, top } = scratch;

    reps.clear();
    for index in pool.reps.iter().flatten() {
        reps.push(*index);
    }
    // Legacy Vec::remove preserves the relative order of every remaining
    // piece. Once the first member of a family is consumed, its next
    // representative can move behind another family. Sorting by the stable
    // original index exactly reproduces that legacy representative order.
    reps.sort_unstable();

    measures.clear();
    if opts.multi_rebanada && level < opts.etapas {
        for &index in reps.iter() {
            let piece = &pool.pieces[index];
            for orientation in piece.orientations() {
                measures.push(if en_x { orientation.base } else { orientation.altura });
            }
        }
    }

    top.clear();
    for &rep_index in reps.iter() {
        let piece = &pool.pieces[rep_index];
        let available = pool.counts[piece.sig];
        for orientation in piece.orientations() {
            let a = if en_x { orientation.base } else { orientation.altura };
            let b = if en_x { orientation.altura } else { orientation.base };
            if a > remaining + EPS || b > perp + EPS { continue; }
            let sobra = perp - b;

            let mut riesgo: f64 = 0.0;
            if opts.penalizar_franja_muerta && level <= 2 {
                let area_candidate = a * b;
                for &other_index in reps.iter() {
                    let other = &pool.pieces[other_index];
                    let q_count = pool.counts[other.sig] as f64;
                    for qo in other.orientations() {
                        let d = if en_x { qo.base } else { qo.altura };
                        let qb = if en_x { qo.altura } else { qo.base };
                        if qb > perp + EPS || d >= a - EPS { continue; }
                        let residual = a - d;
                        if residual <= opts.sierra.max(10.0) || residual >= opts.resto_min { continue; }
                        let q_area = d * qb;
                        if q_area > area_candidate * 1.05 {
                            riesgo = riesgo.max(residual * q_area * q_count);
                        }
                        if let Some(delta) = opts.deltas_estructurales.iter()
                            .find(|x| (x.delta - residual).abs() <= 0.6)
                        {
                            if (qb - b).abs() <= (opts.sierra + 0.5).max(1.0) {
                                riesgo = riesgo.max(
                                    residual * area_candidate.max(q_area) * delta.n.max(2.0) * q_count
                                );
                            }
                        }
                    }
                }
            }

            let insert = |candidate: Candidate, top: &mut Vec<Candidate>| {
                let pos = top.iter()
                    .position(|existing| candidate_better(&candidate, existing, opts, level, criterion));
                match pos {
                    Some(i) => top.insert(i, candidate),
                    None => top.push(candidate),
                }
                if top.len() > 3 { top.truncate(3); }
            };

            insert(Candidate {
                index: rep_index,
                orientation: *orientation,
                a,
                b,
                sobra,
                exacta: if sobra < EPS { 0 } else { 1 },
                area: a * b,
                mult: 1,
                riesgo_franja: riesgo,
            }, top);

            if opts.multi_rebanada && level < opts.etapas && available >= 2 {
                for mult in 2..=usize::min(3, available) {
                    let thickness = mult as f64 * a + (mult as f64 - 1.0) * opts.sierra;
                    if thickness > remaining + EPS { continue; }
                    let useful = measures.iter().any(|d| *d > a + EPS && *d <= thickness + EPS);
                    if !useful { continue; }
                    insert(Candidate {
                        index: rep_index,
                        orientation: *orientation,
                        a: thickness,
                        b,
                        sobra,
                        exacta: 1,
                        area: thickness * b,
                        mult: mult as u32,
                        riesgo_franja: 0.0,
                    }, top);
                }
            }
        }
    }

    if top.is_empty() { return None; }
    if let Some(rng) = rng.as_deref_mut() {
        if top.len() >= 2 && rng.next() < opts.ruido {
            if top.len() >= 3 && rng.next() < 0.5 { return Some(top[2].clone()); }
            return Some(top[1].clone());
        }
    }
    Some(top[0].clone())
}

fn used_thickness(block: Region, parent_axis: Axis, placed: &[Placed], from: usize) -> f64 {
    let mut used: f64 = 0.0;
    for item in placed.iter().skip(from) {
        used = used.max(if parent_axis == Axis::X {
            (item.x + item.base) - block.x
        } else {
            (item.y + item.altura) - block.y
        });
    }
    used
}

fn crop_rest(rest: &mut Rest, axis: Axis, limit: f64) -> bool {
    if axis == Axis::X {
        if rest.x >= limit - EPS { return false; }
        rest.w = 0.0_f64.max((rest.x + rest.w).min(limit) - rest.x);
    } else {
        if rest.y >= limit - EPS { return false; }
        rest.h = 0.0_f64.max((rest.y + rest.h).min(limit) - rest.y);
    }
    rest.w > EPS && rest.h > EPS
}

fn crop_cuts(cuts: &mut Vec<Cut>, from: usize, axis: Axis, limit: f64) {
    let mut index = cuts.len();
    while index > from {
        index -= 1;
        let cut = &mut cuts[index];
        let remove = if axis == Axis::X {
            if cut.x1 > limit + EPS && cut.x2 > limit + EPS { true }
            else {
                cut.x1 = cut.x1.min(limit);
                cut.x2 = cut.x2.min(limit);
                (cut.x1 - cut.x2).abs() <= EPS && (cut.x1 - limit).abs() <= EPS
            }
        } else {
            if cut.y1 > limit + EPS && cut.y2 > limit + EPS { true }
            else {
                cut.y1 = cut.y1.min(limit);
                cut.y2 = cut.y2.min(limit);
                (cut.y1 - cut.y2).abs() <= EPS && (cut.y1 - limit).abs() <= EPS
            }
        };
        if remove {
            cuts.remove(index);
            continue;
        }
        cuts[index].largo = (cuts[index].x2 - cuts[index].x1).abs() + (cuts[index].y2 - cuts[index].y1).abs();
        if cuts[index].largo <= EPS { cuts.remove(index); }
    }
}

fn crop_rests(rests: &mut Vec<Rest>, from: usize, axis: Axis, limit: f64) {
    let mut index = rests.len();
    while index > from {
        index -= 1;
        if !crop_rest(&mut rests[index], axis, limit) {
            rests.remove(index);
        }
    }
}

fn new_tree(region: Region, level: u32) -> TreeNode {
    TreeNode {
        x: region.x,
        y: region.y,
        w: region.w,
        h: region.h,
        dir: region.dir.as_str().to_string(),
        nivel: level,
        partes: Vec::new(),
    }
}

fn crop_tree(node: &mut TreeNode, axis: Axis, limit: f64) {
    if axis == Axis::X {
        node.w = 0.0_f64.max((node.x + node.w).min(limit) - node.x);
    } else {
        node.h = 0.0_f64.max((node.y + node.h).min(limit) - node.y);
    }

    let mut next = Vec::with_capacity(node.partes.len());
    for mut part in node.partes.drain(..) {
        if !crop_rest(&mut part.bloque, axis, limit) {
            continue;
        }
        if node.dir == axis.as_str() {
            part.cut = if axis == Axis::X { part.bloque.w } else { part.bloque.h };
        }
        crop_tree(&mut part.hijo, axis, limit);
        next.push(part);
    }
    node.partes = next;
}

fn fill(
    region: Region,
    pool: &mut PoolState,
    placed: &mut Vec<Placed>,
    level: u32,
    opts: &PackOptions,
    rng: &mut Option<Rng>,
    cuts: &mut Vec<Cut>,
    rests: &mut Vec<Rest>,
    tree: &mut TreeNode,
    scratch: &mut Scratch,
) {
    let perp = region.perp();
    let total = region.length();
    let mut pos = 0.0;

    while pos < total - EPS {
        let selected = match choose(pool, region, total - pos, perp, opts, rng.as_mut(), level, scratch) {
            Some(value) => value,
            None => break,
        };
        let proposed = selected.a;
        let mut thickness = proposed;
        let mut block = if region.dir == Axis::X {
            Region { x: region.x + pos, y: region.y, w: thickness, h: perp, dir: region.dir }
        } else {
            Region { x: region.x, y: region.y + pos, w: perp, h: thickness, dir: region.dir }
        };

        if selected.mult == 1 && (selected.sobra < EPS || level >= opts.etapas) {
            let piece = pool.take(selected.index);
            let piece_id = piece.id;
            placed.push(Placed {
                id: piece.id,
                x: block.x,
                y: block.y,
                base: selected.orientation.base,
                altura: selected.orientation.altura,
                rotada: selected.orientation.rotada,
                nivel: level,
            });

            let child_region = Region {
                x: block.x,
                y: block.y,
                w: block.w,
                h: block.h,
                dir: region.dir.opposite(),
            };
            let mut child = new_tree(child_region, level + 1);
            if selected.sobra > EPS && level >= opts.etapas {
                let piece_block = if region.dir == Axis::X {
                    Rest { x: block.x, y: block.y, w: thickness, h: selected.b }
                } else {
                    Rest { x: block.x, y: block.y, w: selected.b, h: thickness }
                };
                let leaf_region = Region {
                    x: piece_block.x,
                    y: piece_block.y,
                    w: piece_block.w,
                    h: piece_block.h,
                    dir: region.dir,
                };
                let leaf = new_tree(leaf_region, level + 2);
                child.partes.push(TreePart {
                    cut: selected.b,
                    kind: 1,
                    piece_id: Some(piece_id),
                    bloque: piece_block,
                    hijo: Box::new(leaf),
                    terminal: Some(true),
                });
                tree.partes.push(TreePart {
                    cut: thickness,
                    kind: 2,
                    piece_id: None,
                    bloque: Rest { x: block.x, y: block.y, w: block.w, h: block.h },
                    hijo: Box::new(child),
                    terminal: Some(true),
                });
            } else {
                tree.partes.push(TreePart {
                    cut: thickness,
                    kind: 1,
                    piece_id: Some(piece_id),
                    bloque: Rest { x: block.x, y: block.y, w: block.w, h: block.h },
                    hijo: Box::new(child),
                    terminal: None,
                });
            }

            if selected.sobra > EPS {
                if level >= opts.etapas {
                    cuts.push(if region.dir == Axis::X {
                        Cut { x1: block.x, y1: block.y + selected.b, x2: block.x + thickness, y2: block.y + selected.b,
                            nivel: level + 1, largo: thickness, terminal: Some(true) }
                    } else {
                        Cut { x1: block.x + selected.b, y1: block.y, x2: block.x + selected.b, y2: block.y + thickness,
                            nivel: level + 1, largo: thickness, terminal: Some(true) }
                    });
                }
                let rest = if region.dir == Axis::X {
                    Rest { x: block.x, y: block.y + selected.b + opts.sierra, w: thickness, h: perp - selected.b - opts.sierra }
                } else {
                    Rest { x: block.x + selected.b, y: block.y, w: perp - selected.b - opts.sierra, h: thickness }
                };
                if rest.w > EPS && rest.h > EPS { rests.push(rest); }
            }
        } else {
            let sub = Region { x: block.x, y: block.y, w: block.w, h: block.h, dir: region.dir.opposite() };
            let before = placed.len();
            let rest_mark = rests.len();
            let cut_mark = cuts.len();
            let mut child = new_tree(sub, level + 1);

            fill(sub, pool, placed, level + 1, opts, rng, cuts, rests, &mut child, scratch);

            if placed.len() == before {
                rests.truncate(rest_mark);
                cuts.truncate(cut_mark);
                break;
            }

            if opts.contraer_rebanada_real {
                let used = used_thickness(block, region.dir, placed, before);
                if used > EPS && used < thickness - EPS {
                    let limit = if region.dir == Axis::X { block.x + used } else { block.y + used };
                    crop_cuts(cuts, cut_mark, region.dir, limit);
                    crop_rests(rests, rest_mark, region.dir, limit);
                    crop_tree(&mut child, region.dir, limit);
                    thickness = used;
                    if region.dir == Axis::X { block.w = thickness; } else { block.h = thickness; }
                }
            }
            tree.partes.push(TreePart {
                cut: thickness,
                kind: 2,
                piece_id: None,
                bloque: Rest { x: block.x, y: block.y, w: block.w, h: block.h },
                hijo: Box::new(child),
                terminal: None,
            });
        }

        if pos + thickness < total - EPS {
            let k = pos + thickness;
            cuts.push(if region.dir == Axis::X {
                Cut { x1: region.x + k, y1: region.y, x2: region.x + k, y2: region.y + perp,
                    nivel: level, largo: perp, terminal: None }
            } else {
                Cut { x1: region.x, y1: region.y + k, x2: region.x + perp, y2: region.y + k,
                    nivel: level, largo: perp, terminal: None }
            });
        }
        pos += thickness + opts.sierra;
    }

    if pos < total - EPS {
        let rest = if region.dir == Axis::X {
            Rest { x: region.x + pos, y: region.y, w: total - pos, h: perp }
        } else {
            Rest { x: region.x, y: region.y + pos, w: perp, h: total - pos }
        };
        if rest.w > EPS && rest.h > EPS { rests.push(rest); }
    }
}

fn useful(rest: &Rest, opts: &PackOptions) -> bool {
    rest.w.min(rest.h) >= opts.resto_min && rest.w.max(rest.h) >= opts.resto_max
}


fn pack_template(
    template: &[Piece],
    opts: &PackOptions,
    random_seed: Option<u32>,
) -> std::result::Result<PackOutput, String> {
    if opts.ancho_util <= 0.0 || opts.alto_util <= 0.0 || opts.sierra < 0.0 || opts.etapas == 0 {
        return Err("invalid pack geometry".to_string());
    }
    let dir = Axis::parse(&opts.dir_inicial)?;
    let mut pool = PoolState::new(template);
    let mut scratch = Scratch::new(&pool);
    let mut rng = random_seed.map(Rng::new);
    let mut placed = Vec::new();
    let mut cuts = Vec::new();
    let mut rests = Vec::new();
    let region = Region { x: 0.0, y: 0.0, w: opts.ancho_util, h: opts.alto_util, dir };
    let mut tree = new_tree(region, 1);
    fill(
        region, &mut pool, &mut placed, 1, opts, &mut rng,
        &mut cuts, &mut rests, &mut tree, &mut scratch,
    );
    cuts.sort_by(|a, b| a.nivel.cmp(&b.nivel));

    let area = placed.iter().map(|item| item.base * item.altura).sum();
    let area_resto = rests.iter().filter(|rest| useful(rest, opts)).map(|rest| rest.w * rest.h).sum();
    Ok(PackOutput { colocadas: placed, cortes: cuts, restos: rests, arbol: tree, area, area_resto })
}

fn pack_prepared(
    inputs: &[PieceInput],
    opts: &PackOptions,
    random_seed: Option<u32>,
) -> std::result::Result<PackOutput, String> {
    let template = prepare_pieces(inputs, opts.material_con_veta);
    pack_template(&template, opts, random_seed)
}

fn common_template(inputs: &[PieceInput], requests: &[PackBatchRequest]) -> Option<Vec<Piece>> {
    let first = requests.first()?;
    if requests.iter().all(|request| request.options.material_con_veta == first.options.material_con_veta) {
        Some(prepare_pieces(inputs, first.options.material_con_veta))
    } else {
        None
    }
}

fn pack_request(
    inputs: &[PieceInput],
    template: Option<&[Piece]>,
    request: &PackBatchRequest,
) -> std::result::Result<PackOutput, String> {
    match template {
        Some(template) => pack_template(template, &request.options, request.random_seed),
        None => pack_prepared(inputs, &request.options, request.random_seed),
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemnantQuality {
    largest: f64,
    second: f64,
    fragments: usize,
    total: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BeamCandidateLite {
    request_index: usize,
    used_ids: Vec<u32>,
    area: f64,
    area_resto: f64,
    pending_area: f64,
    quality: RemnantQuality,
}

fn remnant_quality(output: &PackOutput, opts: &PackOptions) -> RemnantQuality {
    let mut largest = 0.0;
    let mut second = 0.0;
    let mut fragments = 0usize;
    let mut total = 0.0;
    for rest in &output.restos {
        if !useful(rest, opts) { continue; }
        let area = rest.w * rest.h;
        fragments += 1;
        total += area;
        if area > largest {
            second = largest;
            largest = area;
        } else if area > second {
            second = area;
        }
    }
    RemnantQuality { largest, second, fragments, total }
}

fn compare_quality(a: RemnantQuality, b: RemnantQuality) -> i8 {
    let eps = 1e-6;
    if a.largest > b.largest + eps { return 1; }
    if b.largest > a.largest + eps { return -1; }
    if a.second > b.second + eps { return 1; }
    if b.second > a.second + eps { return -1; }
    if a.fragments != b.fragments { return if a.fragments < b.fragments { 1 } else { -1 }; }
    if a.total > b.total + eps { return 1; }
    if b.total > a.total + eps { return -1; }
    0
}

fn board_candidate_better(a: &PackOutput, b: &PackOutput, opts: &PackOptions) -> bool {
    compare_quality(remnant_quality(a, opts), remnant_quality(b, opts)) > 0
}

fn usage_signature(output: &PackOutput) -> String {
    let mut ids: Vec<u32> = output.colocadas.iter().map(|p| p.id).collect();
    ids.sort_unstable();
    let mut signature = String::new();
    for id in ids {
        use std::fmt::Write;
        let _ = write!(signature, "{id},");
    }
    signature
}

fn pending_area(inputs: &[PieceInput], output: &PackOutput) -> f64 {
    let used: HashSet<u32> = output.colocadas.iter().map(|p| p.id).collect();
    inputs.iter()
        .filter(|piece| !used.contains(&piece.id))
        .map(|piece| piece.cut_base * piece.cut_altura)
        .sum()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PackBatchRequest {
    options: PackOptions,
    random_seed: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GreedyPlanConfig {
    options: PackOptions,
    config_id: u32,
}

fn mix_seed(nums: &[u32]) -> u32 {
    let mut h = 2_166_136_261u32;
    for n in nums {
        h ^= *n;
        h = h.wrapping_mul(16_777_619);
        h ^= h >> 13;
        h = h.wrapping_mul(2_654_435_761);
    }
    h
}

fn greedy_plan_requests(
    configs: &[GreedyPlanConfig],
    semilla: u32,
    pass: u32,
    board: u32,
    restarts_per_board: u32,
) -> Vec<PackBatchRequest> {
    let mut requests = Vec::new();
    for config in configs {
        let randomized = config.options.ruido > 0.0;
        let reps = if randomized { restarts_per_board.max(1) } else { 1 };
        for restart in 0..reps {
            requests.push(PackBatchRequest {
                options: config.options.clone(),
                random_seed: if randomized {
                    Some(mix_seed(&[semilla, pass, config.config_id, restart, board]))
                } else {
                    None
                },
            });
        }
    }
    requests
}


#[napi(js_name = "packBoardLegacyBatch")]
pub fn pack_board_legacy_batch(pieces_json: String, requests_json: String) -> Result<String> {
    let inputs: Vec<PieceInput> = serde_json::from_str(&pieces_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid piece JSON: {e}")))?;
    let requests: Vec<PackBatchRequest> = serde_json::from_str(&requests_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid batch requests JSON: {e}")))?;

    let template = common_template(&inputs, &requests);
    let mut outputs = Vec::with_capacity(requests.len());
    for request in &requests {
        outputs.push(
            pack_request(&inputs, template.as_deref(), request)
                .map_err(|e| Error::new(Status::InvalidArg, e))?
        );
    }

    serde_json::to_string(&outputs)
        .map_err(|e| Error::new(Status::GenericFailure, format!("serialize legacy pack batch: {e}")))
}


#[derive(Debug, Clone, Copy)]
struct PlanDepth {
    max_xml_layer: u32,
    max_type2_layer: u32,
    max_type1_layer: u32,
    type2_nodes: u32,
}

fn accumulate_depth(node: &TreeNode, depth: &mut PlanDepth) {
    depth.max_xml_layer = depth.max_xml_layer.max(node.nivel);
    for part in &node.partes {
        if part.kind == 2 {
            depth.max_type2_layer = depth.max_type2_layer.max(node.nivel);
            depth.type2_nodes += 1;
        } else if part.kind == 1 {
            depth.max_type1_layer = depth.max_type1_layer.max(node.nivel);
        }
        accumulate_depth(&part.hijo, depth);
    }
}

fn plan_depth(boards: &[PackOutput]) -> PlanDepth {
    let mut depth = PlanDepth {
        max_xml_layer: 0,
        max_type2_layer: 0,
        max_type1_layer: 0,
        type2_nodes: 0,
    };
    for board in boards {
        accumulate_depth(&board.arbol, &mut depth);
    }
    depth
}

fn compare_plan_depth(a: PlanDepth, b: PlanDepth) -> i8 {
    if a.max_xml_layer != b.max_xml_layer { return if a.max_xml_layer < b.max_xml_layer { 1 } else { -1 }; }
    if a.max_type2_layer != b.max_type2_layer { return if a.max_type2_layer < b.max_type2_layer { 1 } else { -1 }; }
    if a.max_type1_layer != b.max_type1_layer { return if a.max_type1_layer < b.max_type1_layer { 1 } else { -1 }; }
    if a.type2_nodes != b.type2_nodes { return if a.type2_nodes < b.type2_nodes { 1 } else { -1 }; }
    0
}

fn plan_quality(boards: &[PackOutput], opts: &PackOptions) -> RemnantQuality {
    let mut largest = 0.0;
    let mut second = 0.0;
    let mut fragments = 0usize;
    let mut total = 0.0;
    for board in boards {
        for rest in &board.restos {
            if !useful(rest, opts) { continue; }
            let area = rest.w * rest.h;
            fragments += 1;
            total += area;
            if area > largest {
                second = largest;
                largest = area;
            } else if area > second {
                second = area;
            }
        }
    }
    RemnantQuality { largest, second, fragments, total }
}

fn better_plan_same_boards(
    candidate: &[PackOutput],
    current: &[PackOutput],
    opts: &PackOptions,
    prefer_lower_depth: bool,
) -> bool {
    if prefer_lower_depth {
        let d = compare_plan_depth(plan_depth(candidate), plan_depth(current));
        if d != 0 { return d > 0; }
    }
    compare_quality(plan_quality(candidate, opts), plan_quality(current, opts)) > 0
}

fn run_greedy_plan_internal(
    mut inputs: Vec<PieceInput>,
    configs: &[GreedyPlanConfig],
    semilla: u32,
    pass: u32,
    restarts_per_board: u32,
    tolerance: f64,
) -> std::result::Result<Vec<PackOutput>, String> {
    if configs.is_empty() {
        return Err("greedy plan requires configs".to_string());
    }

    let mut boards: Vec<PackOutput> = Vec::new();
    let mut guard = 0u32;

    while !inputs.is_empty() && guard < 300 {
        let board_index = boards.len() as u32;
        let requests = greedy_plan_requests(
            configs,
            semilla,
            pass,
            board_index,
            restarts_per_board,
        );
        let quality_opts = &requests[0].options;
        let template = common_template(&inputs, &requests);
        let mut outputs: Vec<PackOutput> = Vec::with_capacity(requests.len());

        for request in &requests {
            let output = pack_request(&inputs, template.as_deref(), request)?;
            if !output.colocadas.is_empty() {
                outputs.push(output);
            }
        }

        if outputs.is_empty() {
            return Err("No se pudo empacar la placa.".to_string());
        }

        let mut best_close: Option<usize> = None;
        for (index, output) in outputs.iter().enumerate() {
            if output.colocadas.len() != inputs.len() { continue; }
            match best_close {
                None => best_close = Some(index),
                Some(prev) => {
                    let q = compare_quality(
                        remnant_quality(output, quality_opts),
                        remnant_quality(&outputs[prev], quality_opts),
                    );
                    if q > 0 || (q == 0 && output.area > outputs[prev].area) {
                        best_close = Some(index);
                    }
                }
            }
        }

        let selected_index = if let Some(index) = best_close {
            Some(index)
        } else {
            let max_area = outputs.iter().fold(0.0_f64, |acc, output| acc.max(output.area));
            let threshold = max_area * (1.0 - tolerance);
            let mut best: Option<usize> = None;
            for (index, output) in outputs.iter().enumerate() {
                if output.area < threshold { continue; }
                match best {
                    None => best = Some(index),
                    Some(prev) => {
                        let q = compare_quality(
                            remnant_quality(output, quality_opts),
                            remnant_quality(&outputs[prev], quality_opts),
                        );
                        if q > 0 || (q == 0 && output.area > outputs[prev].area + 1e-6) {
                            best = Some(index);
                        }
                    }
                }
            }
            best
        };

        let selected = match selected_index {
            Some(index) => outputs.swap_remove(index),
            None => return Err("No se pudo seleccionar la placa greedy.".to_string()),
        };

        let used: HashSet<u32> = selected.colocadas.iter().map(|p| p.id).collect();
        let before = inputs.len();
        inputs.retain(|piece| !used.contains(&piece.id));
        if inputs.len() >= before {
            return Err("Greedy plan no consumio piezas.".to_string());
        }

        boards.push(selected);
        guard += 1;
    }

    if !inputs.is_empty() {
        return Err("Greedy plan excedio el limite de placas.".to_string());
    }
    Ok(boards)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GreedyRoundResult {
    boards: Vec<PackOutput>,
    stages_used: u32,
}

#[napi(js_name = "packBoardLegacyGreedyRound")]
pub fn pack_board_legacy_greedy_round(
    pieces_json: String,
    configs_json: String,
    orders_json: String,
    semilla: u32,
    restarts_per_board: u32,
    tolerance: f64,
    max_stages: u32,
    prefer_lower_depth: bool,
) -> Result<String> {
    let inputs: Vec<PieceInput> = serde_json::from_str(&pieces_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid piece JSON: {e}")))?;
    let base_configs: Vec<GreedyPlanConfig> = serde_json::from_str(&configs_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid greedy config JSON: {e}")))?;
    let orders: Vec<Vec<u32>> = serde_json::from_str(&orders_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid piece orders JSON: {e}")))?;

    if base_configs.is_empty() || orders.is_empty() {
        return Err(Error::new(Status::InvalidArg, "greedy round requires configs and orders"));
    }

    let by_id: HashMap<u32, PieceInput> = inputs.into_iter().map(|piece| (piece.id, piece)).collect();
    let stages: Vec<u32> = if prefer_lower_depth {
        (2..=max_stages.max(2)).collect()
    } else {
        vec![max_stages.max(2)]
    };

    let mut best: Option<(Vec<PackOutput>, u32)> = None;

    for (pass_index, order) in orders.iter().enumerate() {
        let ordered: Vec<PieceInput> = order.iter()
            .map(|id| by_id.get(id).cloned().ok_or_else(|| Error::new(Status::InvalidArg, format!("unknown piece id in order: {id}"))))
            .collect::<Result<Vec<_>>>()?;

        for stage in &stages {
            let mut configs = base_configs.clone();
            for config in &mut configs {
                config.options.etapas = *stage;
            }
            let boards = run_greedy_plan_internal(
                ordered.clone(),
                &configs,
                semilla,
                pass_index as u32,
                restarts_per_board,
                tolerance,
            ).map_err(|e| Error::new(Status::GenericFailure, e))?;

            let replace = match &best {
                None => true,
                Some((current, _)) => {
                    boards.len() < current.len() ||
                    (
                        boards.len() == current.len() &&
                        better_plan_same_boards(&boards, current, &configs[0].options, prefer_lower_depth)
                    )
                }
            };
            if replace {
                best = Some((boards, *stage));
            }
        }
    }

    let (boards, stages_used) = best.ok_or_else(|| Error::new(Status::GenericFailure, "No se pudo armar un plan completo."))?;
    serde_json::to_string(&GreedyRoundResult { boards, stages_used })
        .map_err(|e| Error::new(Status::GenericFailure, format!("serialize greedy round: {e}")))
}


#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MasterTypeInput {
    quantity: u32,
    base: f64,
    altura: f64,
    cut_base: f64,
    cut_altura: f64,
    veta: bool,
    #[serde(default)]
    detalle: String,
    type_index: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Master40RunOptions {
    passes: u32,
    explicit_restarts_per_board: Option<u32>,
    default_restarts_per_board: u32,
    tolerance: f64,
    max_stages: u32,
    prefer_lower_depth: bool,
    max_pieces_beam: u32,
    unique_masks_le4: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MasterIdType {
    id: u32,
    type_index: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MasterPatternOutput {
    usage_vector: Vec<u32>,
    area: f64,
    board: PackOutput,
    id_type_pairs: Vec<MasterIdType>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Master40LargeOutput {
    eligible: bool,
    total_rounds: u32,
    executed_rounds: u32,
    skipped_duplicate_rounds: u32,
    failed_rounds: u32,
    patterns: Vec<MasterPatternOutput>,
    profile: Master40Profile,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Master40Profile {
    total_ms: f64,
    expand_ms: f64,
    order_ms: f64,
    greedy_plan_ms: f64,
    dedup_ms: f64,
    plan_trials: u64,
    round_piece_instances: u64,
}

fn legacy_master_schedule(line_count: u32, rounds: u32, seed: u32) -> Vec<Vec<u32>> {
    let mut state = seed;
    let mut out = Vec::with_capacity(rounds as usize);
    for round in 0..rounds {
        if round == 0 {
            out.push((0..line_count).collect());
            continue;
        }
        let mut subset = Vec::new();
        for index in 0..line_count {
            state = state.wrapping_mul(1_103_515_245).wrapping_add(12_345);
            let random = (state & 0x7fff_ffff) as f64 / 2_147_483_647_f64;
            if random > 0.45 {
                subset.push(index);
            }
        }
        out.push(subset);
    }
    out
}

fn expand_master_subset(
    catalog: &[MasterTypeInput],
    indices: &[u32],
) -> (Vec<PieceInput>, Vec<u32>) {
    let mut inputs = Vec::new();
    let mut type_by_id = Vec::new();
    let mut sig_by_shape: HashMap<(u64, u64, bool), u32> = HashMap::new();

    for raw_index in indices {
        let index = *raw_index as usize;
        if index >= catalog.len() { continue; }
        let item = &catalog[index];
        let key = (item.cut_base.to_bits(), item.cut_altura.to_bits(), item.veta);
        let next_sig = sig_by_shape.len() as u32;
        let sig = *sig_by_shape.entry(key).or_insert(next_sig);

        for _ in 0..item.quantity {
            let id = inputs.len() as u32;
            inputs.push(PieceInput {
                id,
                base: item.base,
                altura: item.altura,
                cut_base: item.cut_base,
                cut_altura: item.cut_altura,
                veta: item.veta,
                sig,
                detalle: item.detalle.clone(),
                ref_value: serde_json::Value::from(item.type_index),
            });
            type_by_id.push(item.type_index);
        }
    }
    (inputs, type_by_id)
}

fn master_piece_orders(inputs: &[PieceInput], passes: u32) -> Vec<Vec<u32>> {
    let mut orders = Vec::with_capacity(passes as usize);
    for pass in 0..passes {
        let mut ordered = inputs.to_vec();
        match pass % 4 {
            0 => ordered.sort_by(|a, b| {
                (b.base * b.altura)
                    .total_cmp(&(a.base * a.altura))
            }),
            1 => ordered.sort_by(|a, b| {
                b.base.max(b.altura)
                    .total_cmp(&a.base.max(a.altura))
            }),
            2 => ordered.sort_by(|a, b| {
                b.altura.total_cmp(&a.altura)
                    .then_with(|| b.base.total_cmp(&a.base))
            }),
            _ => ordered.sort_by(|a, b| {
                b.base.total_cmp(&a.base)
                    .then_with(|| b.altura.total_cmp(&a.altura))
            }),
        }
        orders.push(ordered.into_iter().map(|piece| piece.id).collect());
    }
    orders
}

fn dynamic_restarts(opts: &Master40RunOptions, piece_count: usize) -> u32 {
    if let Some(value) = opts.explicit_restarts_per_board {
        return value.max(1);
    }
    let denom = usize::max(60, piece_count) as f64;
    let value = (opts.default_restarts_per_board as f64 * 60.0 / denom).round() as u32;
    value.max(3)
}

fn run_master_large_round(
    inputs: Vec<PieceInput>,
    base_configs: &[GreedyPlanConfig],
    round_seed: u32,
    opts: &Master40RunOptions,
    profile: &mut Master40Profile,
) -> std::result::Result<Vec<PackOutput>, String> {
    let order_started = Instant::now();
    let orders = master_piece_orders(&inputs, opts.passes);
    profile.order_ms += order_started.elapsed().as_secs_f64() * 1000.0;
    let by_id: HashMap<u32, PieceInput> =
        inputs.iter().cloned().map(|piece| (piece.id, piece)).collect();
    let stages: Vec<u32> = if opts.prefer_lower_depth {
        (2..=opts.max_stages.max(2)).collect()
    } else {
        vec![opts.max_stages.max(2)]
    };
    let restarts = dynamic_restarts(opts, inputs.len());

    let mut best: Option<Vec<PackOutput>> = None;
    for (pass_index, order) in orders.iter().enumerate() {
        let ordered: Vec<PieceInput> = order.iter()
            .filter_map(|id| by_id.get(id).cloned())
            .collect();
        if ordered.len() != inputs.len() {
            return Err("master round order lost pieces".to_string());
        }

        for stage in &stages {
            let mut configs = base_configs.to_vec();
            for config in &mut configs {
                config.options.etapas = *stage;
            }
            profile.plan_trials += 1;
            let plan_started = Instant::now();
            let boards = run_greedy_plan_internal(
                ordered.clone(),
                &configs,
                round_seed,
                pass_index as u32,
                restarts,
                opts.tolerance,
            )?;
            profile.greedy_plan_ms += plan_started.elapsed().as_secs_f64() * 1000.0;

            let replace = match &best {
                None => true,
                Some(current) => {
                    boards.len() < current.len() ||
                    (
                        boards.len() == current.len() &&
                        better_plan_same_boards(
                            &boards,
                            current,
                            &configs[0].options,
                            opts.prefer_lower_depth,
                        )
                    )
                }
            };
            if replace {
                best = Some(boards);
            }
        }
    }
    best.ok_or_else(|| "master round produced no complete plan".to_string())
}

#[napi(js_name = "packBoardLegacyMaster40Large")]
pub fn pack_board_legacy_master40_large(
    catalog_json: String,
    configs_json: String,
    run_options_json: String,
    rounds: u32,
    seed: u32,
) -> Result<String> {
    let total_started = Instant::now();
    let mut profile = Master40Profile::default();

    let catalog: Vec<MasterTypeInput> = serde_json::from_str(&catalog_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid master catalog JSON: {e}")))?;
    let configs: Vec<GreedyPlanConfig> = serde_json::from_str(&configs_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid master configs JSON: {e}")))?;
    let run_opts: Master40RunOptions = serde_json::from_str(&run_options_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid master run options JSON: {e}")))?;

    if catalog.is_empty() || configs.is_empty() {
        return Err(Error::new(Status::InvalidArg, "master40 large context requires catalog/configs"));
    }

    let schedule = legacy_master_schedule(catalog.len() as u32, rounds, seed);
    let mut seen_masks: HashSet<Vec<u32>> = HashSet::new();
    let use_unique_masks =
        run_opts.unique_masks_le4 &&
        catalog.len() <= 4 &&
        rounds == 40 &&
        seed == 7;

    let mut executable: Vec<(usize, Vec<u32>)> = Vec::new();
    let mut skipped_duplicate_rounds = 0u32;
    for (round, indices) in schedule.into_iter().enumerate() {
        if indices.is_empty() { continue; }
        if use_unique_masks && !seen_masks.insert(indices.clone()) {
            skipped_duplicate_rounds += 1;
            continue;
        }
        let piece_count: u32 = indices.iter()
            .filter_map(|index| catalog.get(*index as usize))
            .map(|item| item.quantity)
            .sum();
        if piece_count <= run_opts.max_pieces_beam {
            return serde_json::to_string(&Master40LargeOutput {
                eligible: false,
                total_rounds: rounds,
                executed_rounds: executable.len() as u32,
                skipped_duplicate_rounds,
                failed_rounds: 0,
                patterns: Vec::new(),
                profile: {
                    profile.total_ms = total_started.elapsed().as_secs_f64() * 1000.0;
                    profile.clone()
                },
            }).map_err(|e| Error::new(Status::GenericFailure, format!("serialize master40 eligibility: {e}")));
        }
        executable.push((round, indices));
    }

    let mut selected: Vec<MasterPatternOutput> = Vec::new();
    let mut position_by_usage: HashMap<Vec<u32>, usize> = HashMap::new();
    let mut failed_rounds = 0u32;

    for (round, indices) in &executable {
        let expand_started = Instant::now();
        let (inputs, type_by_id) = expand_master_subset(&catalog, indices);
        profile.expand_ms += expand_started.elapsed().as_secs_f64() * 1000.0;
        profile.round_piece_instances += inputs.len() as u64;
        let boards = match run_master_large_round(
            inputs,
            &configs,
            1000u32.wrapping_add(*round as u32),
            &run_opts,
            &mut profile,
        ) {
            Ok(value) => value,
            Err(_) => {
                failed_rounds += 1;
                continue;
            }
        };

        let dedup_started = Instant::now();
        for board in boards {
            let mut usage = vec![0u32; catalog.len()];
            let mut id_type_pairs = Vec::with_capacity(board.colocadas.len());
            let mut valid = true;
            for placed in &board.colocadas {
                let Some(type_index) = type_by_id.get(placed.id as usize).copied() else {
                    valid = false;
                    break;
                };
                if type_index as usize >= usage.len() {
                    valid = false;
                    break;
                }
                usage[type_index as usize] = usage[type_index as usize].saturating_add(1);
                id_type_pairs.push(MasterIdType { id: placed.id, type_index });
            }
            if !valid || usage.iter().all(|value| *value == 0) { continue; }

            let area = board.area;
            if let Some(slot) = position_by_usage.get(&usage).copied() {
                if area > selected[slot].area {
                    selected[slot] = MasterPatternOutput {
                        usage_vector: usage,
                        area,
                        board,
                        id_type_pairs,
                    };
                }
            } else {
                position_by_usage.insert(usage.clone(), selected.len());
                selected.push(MasterPatternOutput {
                    usage_vector: usage,
                    area,
                    board,
                    id_type_pairs,
                });
            }
        }
        profile.dedup_ms += dedup_started.elapsed().as_secs_f64() * 1000.0;
    }

    profile.total_ms = total_started.elapsed().as_secs_f64() * 1000.0;
    serde_json::to_string(&Master40LargeOutput {
        eligible: true,
        total_rounds: rounds,
        executed_rounds: executable.len() as u32,
        skipped_duplicate_rounds,
        failed_rounds,
        patterns: selected,
        profile,
    })
    .map_err(|e| Error::new(Status::GenericFailure, format!("serialize master40 large context: {e}")))
}

#[napi(js_name = "packBoardLegacyGreedyPlan")]
pub fn pack_board_legacy_greedy_plan(
    pieces_json: String,
    configs_json: String,
    semilla: u32,
    pass: u32,
    restarts_per_board: u32,
    tolerance: f64,
) -> Result<String> {
    let mut inputs: Vec<PieceInput> = serde_json::from_str(&pieces_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid piece JSON: {e}")))?;
    let configs: Vec<GreedyPlanConfig> = serde_json::from_str(&configs_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid greedy config JSON: {e}")))?;

    if configs.is_empty() {
        return Err(Error::new(Status::InvalidArg, "greedy plan requires configs"));
    }

    let mut boards: Vec<PackOutput> = Vec::new();
    let mut guard = 0u32;

    while !inputs.is_empty() && guard < 300 {
        let board_index = boards.len() as u32;
        let requests = greedy_plan_requests(
            &configs,
            semilla,
            pass,
            board_index,
            restarts_per_board,
        );
        let quality_opts = &requests[0].options;
        let template = common_template(&inputs, &requests);
        let mut outputs: Vec<PackOutput> = Vec::with_capacity(requests.len());

        for request in &requests {
            let output = pack_request(&inputs, template.as_deref(), request)
                .map_err(|e| Error::new(Status::InvalidArg, e))?;
            if !output.colocadas.is_empty() {
                outputs.push(output);
            }
        }

        if outputs.is_empty() {
            return Err(Error::new(Status::GenericFailure, "No se pudo empacar la placa."));
        }

        let mut best_close: Option<usize> = None;
        for (index, output) in outputs.iter().enumerate() {
            if output.colocadas.len() != inputs.len() { continue; }
            match best_close {
                None => best_close = Some(index),
                Some(prev) => {
                    let q = compare_quality(
                        remnant_quality(output, quality_opts),
                        remnant_quality(&outputs[prev], quality_opts),
                    );
                    if q > 0 || (q == 0 && output.area > outputs[prev].area) {
                        best_close = Some(index);
                    }
                }
            }
        }

        let selected_index = if let Some(index) = best_close {
            Some(index)
        } else {
            let max_area = outputs.iter().fold(0.0_f64, |acc, output| acc.max(output.area));
            let threshold = max_area * (1.0 - tolerance);
            let mut best: Option<usize> = None;
            for (index, output) in outputs.iter().enumerate() {
                if output.area < threshold { continue; }
                match best {
                    None => best = Some(index),
                    Some(prev) => {
                        let q = compare_quality(
                            remnant_quality(output, quality_opts),
                            remnant_quality(&outputs[prev], quality_opts),
                        );
                        if q > 0 || (q == 0 && output.area > outputs[prev].area + 1e-6) {
                            best = Some(index);
                        }
                    }
                }
            }
            best
        };

        let selected = match selected_index {
            Some(index) => outputs.swap_remove(index),
            None => return Err(Error::new(Status::GenericFailure, "No se pudo seleccionar la placa greedy.")),
        };

        let used: HashSet<u32> = selected.colocadas.iter().map(|p| p.id).collect();
        let before = inputs.len();
        inputs.retain(|piece| !used.contains(&piece.id));
        if inputs.len() >= before {
            return Err(Error::new(Status::GenericFailure, "Greedy plan no consumio piezas."));
        }

        boards.push(selected);
        guard += 1;
    }

    if !inputs.is_empty() {
        return Err(Error::new(Status::GenericFailure, "Greedy plan excedio el limite de placas."));
    }

    serde_json::to_string(&boards)
        .map_err(|e| Error::new(Status::GenericFailure, format!("serialize greedy plan: {e}")))
}

#[napi(js_name = "packBoardLegacyGreedyBest")]
pub fn pack_board_legacy_greedy_best(
    pieces_json: String,
    requests_json: String,
    tolerance: f64,
) -> Result<String> {
    let inputs: Vec<PieceInput> = serde_json::from_str(&pieces_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid piece JSON: {e}")))?;
    let requests: Vec<PackBatchRequest> = serde_json::from_str(&requests_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid batch requests JSON: {e}")))?;
    if requests.is_empty() {
        return Ok("null".to_string());
    }

    let quality_opts = &requests[0].options;
    let template = common_template(&inputs, &requests);
    let mut outputs = Vec::with_capacity(requests.len());
    for request in &requests {
        let output = pack_request(&inputs, template.as_deref(), request)
            .map_err(|e| Error::new(Status::InvalidArg, e))?;
        if !output.colocadas.is_empty() {
            outputs.push(output);
        }
    }
    if outputs.is_empty() {
        return Ok("null".to_string());
    }

    let mut best_close: Option<usize> = None;
    for (index, output) in outputs.iter().enumerate() {
        if output.colocadas.len() != inputs.len() { continue; }
        match best_close {
            None => best_close = Some(index),
            Some(prev) => {
                let q = compare_quality(remnant_quality(output, quality_opts), remnant_quality(&outputs[prev], quality_opts));
                if q > 0 || (q == 0 && output.area > outputs[prev].area) {
                    best_close = Some(index);
                }
            }
        }
    }
    if let Some(index) = best_close {
        return serde_json::to_string(&outputs[index])
            .map_err(|e| Error::new(Status::GenericFailure, format!("serialize greedy best: {e}")));
    }

    let max_area = outputs.iter().fold(0.0_f64, |acc, output| acc.max(output.area));
    let threshold = max_area * (1.0 - tolerance);
    let mut best: Option<usize> = None;
    for (index, output) in outputs.iter().enumerate() {
        if output.area < threshold { continue; }
        match best {
            None => best = Some(index),
            Some(prev) => {
                let q = compare_quality(remnant_quality(output, quality_opts), remnant_quality(&outputs[prev], quality_opts));
                if q > 0 || (q == 0 && output.area > outputs[prev].area + 1e-6) {
                    best = Some(index);
                }
            }
        }
    }

    match best {
        Some(index) => serde_json::to_string(&outputs[index])
            .map_err(|e| Error::new(Status::GenericFailure, format!("serialize greedy best: {e}"))),
        None => Ok("null".to_string()),
    }
}

#[napi(js_name = "packBoardLegacyBeamCandidates")]
pub fn pack_board_legacy_beam_candidates(
    pieces_json: String,
    requests_json: String,
    beam_width: u32,
) -> Result<String> {
    let inputs: Vec<PieceInput> = serde_json::from_str(&pieces_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid piece JSON: {e}")))?;
    let requests: Vec<PackBatchRequest> = serde_json::from_str(&requests_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid batch requests JSON: {e}")))?;
    if requests.is_empty() {
        return Ok("[]".to_string());
    }

    let quality_opts = &requests[0].options;
    let template = common_template(&inputs, &requests);
    let mut dedup: HashMap<String, PackOutput> = HashMap::new();
    for request in &requests {
        let output = pack_request(&inputs, template.as_deref(), request)
            .map_err(|e| Error::new(Status::InvalidArg, e))?;
        if output.colocadas.is_empty() { continue; }
        let signature = usage_signature(&output);
        if let Some(previous) = dedup.get(&signature) {
            let q = compare_quality(remnant_quality(&output, quality_opts), remnant_quality(previous, quality_opts));
            if q < 0 || (q == 0 && output.area <= previous.area + 1e-6) {
                continue;
            }
        }
        dedup.insert(signature, output);
    }

    let board_area = quality_opts.ancho_util * quality_opts.alto_util;
    // Keep the canonical usage signature alongside each candidate. HashMap
    // iteration order is intentionally unstable, so the signature becomes the
    // final total-order tie break before truncate().
    //
    // Experimental fast path: the legacy comparator recomputes pending_area()
    // (HashSet + full input scan) and remnant_quality() on every sort
    // comparison. Both values are immutable for a candidate, so cache them
    // once without changing the comparator or candidate set.
    let cache_rank_metrics = std::env::var("OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL")
        .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(false);

    let outputs: Vec<PackOutput> = if cache_rank_metrics {
        let mut ranked: Vec<(String, i64, RemnantQuality, PackOutput)> = dedup
            .into_iter()
            .map(|(signature, output)| {
                let lb = (pending_area(&inputs, &output).max(0.0) / board_area).ceil() as i64;
                let quality = remnant_quality(&output, quality_opts);
                (signature, lb, quality, output)
            })
            .collect();
        ranked.sort_by(|(signature_a, lb_a, quality_a, a), (signature_b, lb_b, quality_b, b)| {
            lb_a.cmp(lb_b)
                .then_with(|| b.area.partial_cmp(&a.area).unwrap_or(std::cmp::Ordering::Equal))
                .then_with(|| {
                    let q = compare_quality(*quality_a, *quality_b);
                    if q > 0 { std::cmp::Ordering::Less }
                    else if q < 0 { std::cmp::Ordering::Greater }
                    else { std::cmp::Ordering::Equal }
                })
                .then_with(|| signature_a.cmp(signature_b))
        });
        let limit = usize::max((beam_width as usize).saturating_mul(3), beam_width as usize);
        ranked.truncate(limit);
        ranked.into_iter().map(|(_, _, _, output)| output).collect()
    } else {
        let mut outputs: Vec<(String, PackOutput)> = dedup.into_iter().collect();
        outputs.sort_by(|(signature_a, a), (signature_b, b)| {
            let lb_a = (pending_area(&inputs, a).max(0.0) / board_area).ceil() as i64;
            let lb_b = (pending_area(&inputs, b).max(0.0) / board_area).ceil() as i64;
            lb_a.cmp(&lb_b)
                .then_with(|| b.area.partial_cmp(&a.area).unwrap_or(std::cmp::Ordering::Equal))
                .then_with(|| {
                    let q = compare_quality(remnant_quality(a, quality_opts), remnant_quality(b, quality_opts));
                    if q > 0 { std::cmp::Ordering::Less }
                    else if q < 0 { std::cmp::Ordering::Greater }
                    else { std::cmp::Ordering::Equal }
                })
                .then_with(|| signature_a.cmp(signature_b))
        });
        let limit = usize::max((beam_width as usize).saturating_mul(3), beam_width as usize);
        outputs.truncate(limit);
        outputs.into_iter().map(|(_, output)| output).collect()
    };

    serde_json::to_string(&outputs)
        .map_err(|e| Error::new(Status::GenericFailure, format!("serialize beam candidates: {e}")))
}


#[napi(js_name = "packBoardLegacyBeamCandidatesLite")]
pub fn pack_board_legacy_beam_candidates_lite(
    pieces_json: String,
    requests_json: String,
    beam_width: u32,
) -> Result<String> {
    let inputs: Vec<PieceInput> = serde_json::from_str(&pieces_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid piece JSON: {e}")))?;
    let requests: Vec<PackBatchRequest> = serde_json::from_str(&requests_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid batch requests JSON: {e}")))?;
    if requests.is_empty() {
        return Ok("[]".to_string());
    }

    let quality_opts = &requests[0].options;
    let template = common_template(&inputs, &requests);
    let mut dedup: HashMap<String, (usize, PackOutput)> = HashMap::new();

    for (request_index, request) in requests.iter().enumerate() {
        let output = pack_request(&inputs, template.as_deref(), request)
            .map_err(|e| Error::new(Status::InvalidArg, e))?;
        if output.colocadas.is_empty() { continue; }

        let signature = usage_signature(&output);
        if let Some((_, previous)) = dedup.get(&signature) {
            let q = compare_quality(
                remnant_quality(&output, quality_opts),
                remnant_quality(previous, quality_opts),
            );
            if q < 0 || (q == 0 && output.area <= previous.area + 1e-6) {
                continue;
            }
        }
        dedup.insert(signature, (request_index, output));
    }

    let board_area = quality_opts.ancho_util * quality_opts.alto_util;
    let mut ranked: Vec<(String, i64, BeamCandidateLite)> = dedup
        .into_iter()
        .map(|(signature, (request_index, output))| {
            let pending = pending_area(&inputs, &output).max(0.0);
            let lb = (pending / board_area).ceil() as i64;
            let quality = remnant_quality(&output, quality_opts);
            let mut used_ids: Vec<u32> = output.colocadas.iter().map(|p| p.id).collect();
            used_ids.sort_unstable();
            let lite = BeamCandidateLite {
                request_index,
                used_ids,
                area: output.area,
                area_resto: output.area_resto,
                pending_area: pending,
                quality,
            };
            (signature, lb, lite)
        })
        .collect();

    ranked.sort_by(|(signature_a, lb_a, a), (signature_b, lb_b, b)| {
        lb_a.cmp(lb_b)
            .then_with(|| b.area.partial_cmp(&a.area).unwrap_or(std::cmp::Ordering::Equal))
            .then_with(|| {
                let q = compare_quality(a.quality, b.quality);
                if q > 0 { std::cmp::Ordering::Less }
                else if q < 0 { std::cmp::Ordering::Greater }
                else { std::cmp::Ordering::Equal }
            })
            .then_with(|| signature_a.cmp(signature_b))
    });

    let limit = usize::max((beam_width as usize).saturating_mul(3), beam_width as usize);
    ranked.truncate(limit);
    let output: Vec<BeamCandidateLite> = ranked.into_iter().map(|(_, _, lite)| lite).collect();

    serde_json::to_string(&output)
        .map_err(|e| Error::new(Status::GenericFailure, format!("serialize lean beam candidates: {e}")))
}

#[napi(js_name = "packBoardLegacyCore")]
pub fn pack_board_legacy_core(pieces_json: String, options_json: String, random_seed: Option<u32>) -> Result<String> {
    let inputs: Vec<PieceInput> = serde_json::from_str(&pieces_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid piece JSON: {e}")))?;
    let opts: PackOptions = serde_json::from_str(&options_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid pack options JSON: {e}")))?;
    let output = pack_prepared(&inputs, &opts, random_seed)
        .map_err(|e| Error::new(Status::InvalidArg, e))?;

    serde_json::to_string(&output)
        .map_err(|e| Error::new(Status::GenericFailure, format!("serialize legacy pack result: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_pool_preserves_legacy_representative_order() {
        let orientation = Orientation { base: 10.0, altura: 10.0, rotada: false };
        let template = vec![
            Piece { id: 0, sig: 0, orientations: [orientation; 2], orientation_count: 1 },
            Piece { id: 1, sig: 1, orientations: [orientation; 2], orientation_count: 1 },
            Piece { id: 2, sig: 0, orientations: [orientation; 2], orientation_count: 1 },
            Piece { id: 3, sig: 2, orientations: [orientation; 2], orientation_count: 1 },
            Piece { id: 4, sig: 1, orientations: [orientation; 2], orientation_count: 1 },
            Piece { id: 5, sig: 0, orientations: [orientation; 2], orientation_count: 1 },
        ];
        let mut stable = PoolState::new(&template);
        let mut legacy = template.clone();

        for _ in 0..template.len() {
            let legacy_reps = {
                let mut seen = HashSet::new();
                legacy.iter()
                    .enumerate()
                    .filter_map(|(index, piece)| seen.insert(piece.sig).then_some((index, piece.id)))
                    .collect::<Vec<_>>()
            };
            let mut stable_reps = stable.reps.iter().flatten().copied().collect::<Vec<_>>();
            stable_reps.sort_unstable();
            let stable_ids = stable_reps.iter().map(|index| stable.pieces[*index].id).collect::<Vec<_>>();
            let legacy_ids = legacy_reps.iter().map(|(_, id)| *id).collect::<Vec<_>>();
            assert_eq!(stable_ids, legacy_ids);

            if legacy.is_empty() { break; }
            // Consume the first current representative, exactly as choose() can.
            let stable_index = stable_reps[0];
            stable.take(stable_index);
            legacy.remove(legacy_reps[0].0);
        }
    }

    #[test]
    fn lcg_matches_js_sequence_shape() {
        let mut rng = Rng::new(7);
        let values = [rng.next(), rng.next(), rng.next()];
        assert!(values.iter().all(|value| *value >= 0.0 && *value < 1.0));
        assert!((values[0] - 0.23878083983436227).abs() < 1e-12);
    }
}
