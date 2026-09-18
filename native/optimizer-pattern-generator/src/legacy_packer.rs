use std::collections::{BTreeSet, HashMap, HashSet};

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
    // Experimental exact optimization. OFF by default so production keeps the
    // frozen Vec-based pool until the A/B gate proves semantic parity.
    #[serde(default)]
    family_pool_index: bool,
    // Exact monotonic pruning within one fill region. If no orientation of a
    // family fits (remaining, perpendicular), remaining only shrinks while
    // perpendicular stays constant, so that family cannot become feasible
    // later in the same row/column.
    #[serde(default)]
    family_fit_prune: bool,
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

struct Scratch {
    counts: Vec<usize>,
    reps: Vec<usize>,
    measures: Vec<f64>,
    top: Vec<Candidate>,
}

impl Scratch {
    fn new(pool: &[Piece]) -> Self {
        let sig_count = pool.iter().map(|piece| piece.sig).max().map(|x| x + 1).unwrap_or(0);
        Self {
            counts: vec![0; sig_count],
            reps: Vec::with_capacity(sig_count),
            measures: Vec::with_capacity(sig_count.saturating_mul(2)),
            top: Vec::with_capacity(4),
        }
    }
}


/*
 * Exact family-indexed pool.
 *
 * The legacy chooser rebuilds, at every free position:
 *   - count per signature/family;
 *   - the first active piece of each family, in current pool order.
 *
 * Every legal choice is one of those family representatives. Because packing
 * only removes pieces (there is no backtracking inside one board pack), the
 * same state can be maintained incrementally. The representative set is keyed
 * by the original piece index so iteration order is exactly the order produced
 * by scanning the legacy Vec after removals. This is an execution optimization,
 * not a candidate-space prune.
 */
struct IndexedPool {
    pieces: Vec<Piece>,
    members_by_sig: Vec<Vec<usize>>,
    cursor_by_sig: Vec<usize>,
    counts: Vec<usize>,
    representatives: BTreeSet<(usize, usize)>, // (original index, sig)
}

impl IndexedPool {
    fn new(template: &[Piece]) -> Self {
        let sig_count = template.iter().map(|piece| piece.sig).max().map(|x| x + 1).unwrap_or(0);
        let mut members_by_sig = vec![Vec::new(); sig_count];
        for (index, piece) in template.iter().enumerate() {
            members_by_sig[piece.sig].push(index);
        }
        let cursor_by_sig = vec![0; sig_count];
        let counts = members_by_sig.iter().map(Vec::len).collect::<Vec<_>>();
        let mut representatives = BTreeSet::new();
        for (sig, members) in members_by_sig.iter().enumerate() {
            if let Some(&index) = members.first() {
                representatives.insert((index, sig));
            }
        }
        Self {
            pieces: template.to_vec(),
            members_by_sig,
            cursor_by_sig,
            counts,
            representatives,
        }
    }

    fn piece(&self, index: usize) -> &Piece {
        &self.pieces[index]
    }

    fn count(&self, sig: usize) -> usize {
        self.counts[sig]
    }

    fn representative_indices(&self) -> impl Iterator<Item = usize> + '_ {
        self.representatives.iter().map(|(index, _)| *index)
    }

    fn remove_representative(&mut self, index: usize) -> Piece {
        let piece = self.pieces[index];
        let sig = piece.sig;
        let cursor = self.cursor_by_sig[sig];
        debug_assert_eq!(self.members_by_sig[sig].get(cursor).copied(), Some(index));
        self.representatives.remove(&(index, sig));
        self.cursor_by_sig[sig] += 1;
        self.counts[sig] -= 1;
        if let Some(&next) = self.members_by_sig[sig].get(self.cursor_by_sig[sig]) {
            self.representatives.insert((next, sig));
        }
        piece
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
    pool: &[Piece],
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
    let Scratch { counts, reps, measures, top } = scratch;

    counts.fill(0);
    reps.clear();
    for (index, piece) in pool.iter().enumerate() {
        if counts[piece.sig] == 0 {
            reps.push(index);
        }
        counts[piece.sig] += 1;
    }

    measures.clear();
    if opts.multi_rebanada && level < opts.etapas {
        for &index in reps.iter() {
            let piece = &pool[index];
            for orientation in piece.orientations() {
                measures.push(if en_x { orientation.base } else { orientation.altura });
            }
        }
    }

    top.clear();
    for &rep_index in reps.iter() {
        let piece = &pool[rep_index];
        let available = counts[piece.sig];
        for orientation in piece.orientations() {
            let a = if en_x { orientation.base } else { orientation.altura };
            let b = if en_x { orientation.altura } else { orientation.base };
            if a > remaining + EPS || b > perp + EPS { continue; }
            let sobra = perp - b;

            let mut riesgo: f64 = 0.0;
            if opts.penalizar_franja_muerta && level <= 2 {
                let area_candidate = a * b;
                for &other_index in reps.iter() {
                    let other = &pool[other_index];
                    let q_count = counts[other.sig] as f64;
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


fn choose_indexed(
    pool: &IndexedPool,
    region: Region,
    remaining: f64,
    perp: f64,
    opts: &PackOptions,
    mut rng: Option<&mut Rng>,
    level: u32,
    scratch: &mut Scratch,
    blocked: &mut [bool],
) -> Option<Candidate> {
    let criterion = if !opts.criterios.is_empty() {
        &opts.criterios[usize::min(level.saturating_sub(1) as usize, opts.criterios.len() - 1)]
    } else {
        &opts.criterio
    };
    let en_x = region.dir == Axis::X;
    let Scratch { measures, top, .. } = scratch;

    measures.clear();
    if opts.multi_rebanada && level < opts.etapas {
        for index in pool.representative_indices() {
            let piece = pool.piece(index);
            for orientation in piece.orientations() {
                measures.push(if en_x { orientation.base } else { orientation.altura });
            }
        }
    }

    top.clear();
    for rep_index in pool.representative_indices() {
        let piece = pool.piece(rep_index);
        if opts.family_fit_prune && blocked[piece.sig] { continue; }
        let available = pool.count(piece.sig);
        let mut any_fit = false;
        for orientation in piece.orientations() {
            let a = if en_x { orientation.base } else { orientation.altura };
            let b = if en_x { orientation.altura } else { orientation.base };
            if a > remaining + EPS || b > perp + EPS { continue; }
            any_fit = true;
            let sobra = perp - b;

            let mut riesgo: f64 = 0.0;
            if opts.penalizar_franja_muerta && level <= 2 {
                let area_candidate = a * b;
                for other_index in pool.representative_indices() {
                    let other = pool.piece(other_index);
                    let q_count = pool.count(other.sig) as f64;
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
        if opts.family_fit_prune && !any_fit {
            blocked[piece.sig] = true;
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

enum PackPool {
    Legacy(Vec<Piece>),
    Indexed(IndexedPool),
}

impl PackPool {
    fn choose(
        &self,
        region: Region,
        remaining: f64,
        perp: f64,
        opts: &PackOptions,
        rng: Option<&mut Rng>,
        level: u32,
        scratch: &mut Scratch,
        blocked: &mut [bool],
    ) -> Option<Candidate> {
        match self {
            Self::Legacy(pool) => choose(pool, region, remaining, perp, opts, rng, level, scratch),
            Self::Indexed(pool) => choose_indexed(pool, region, remaining, perp, opts, rng, level, scratch, blocked),
        }
    }

    fn remove_selected(&mut self, index: usize) -> Piece {
        match self {
            Self::Legacy(pool) => pool.remove(index),
            Self::Indexed(pool) => pool.remove_representative(index),
        }
    }
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
    pool: &mut PackPool,
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
    let mut blocked = vec![false; scratch.counts.len()];

    while pos < total - EPS {
        let selected = match pool.choose(region, total - pos, perp, opts, rng.as_mut(), level, scratch, &mut blocked) {
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
            let piece = pool.remove_selected(selected.index);
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
    let mut pool = if opts.family_pool_index {
        PackPool::Indexed(IndexedPool::new(template))
    } else {
        PackPool::Legacy(template.to_vec())
    };
    let mut scratch = Scratch::new(template);
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

#[derive(Debug, Clone, Copy)]
struct RemnantQuality {
    largest: f64,
    second: f64,
    fragments: usize,
    total: f64,
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
    let mut outputs: Vec<PackOutput> = dedup.into_values().collect();
    outputs.sort_by(|a, b| {
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
    });
    let limit = usize::max((beam_width as usize).saturating_mul(3), beam_width as usize);
    outputs.truncate(limit);

    serde_json::to_string(&outputs)
        .map_err(|e| Error::new(Status::GenericFailure, format!("serialize beam candidates: {e}")))
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
    fn lcg_matches_js_sequence_shape() {
        let mut rng = Rng::new(7);
        let values = [rng.next(), rng.next(), rng.next()];
        assert!(values.iter().all(|value| *value >= 0.0 && *value < 1.0));
        assert!((values[0] - 0.23878083983436227).abs() < 1e-12);
    }


    fn test_piece(id: u32, sig: u32, base: f64, altura: f64) -> PieceInput {
        PieceInput {
            id,
            base,
            altura,
            cut_base: base,
            cut_altura: altura,
            veta: false,
            sig,
            detalle: format!("p{id}"),
            ref_value: serde_json::Value::Null,
        }
    }

    fn parity_options(dir: &str, criterion: &str, multi: bool, penalize: bool) -> PackOptions {
        PackOptions {
            ancho_util: 2600.0,
            alto_util: 1830.0,
            sierra: 4.4,
            etapas: 4,
            material_con_veta: false,
            criterio: criterion.to_string(),
            criterios: vec![criterion.to_string(), criterion.to_string()],
            dir_inicial: dir.to_string(),
            ruido: 0.3,
            resto_min: 250.0,
            resto_max: 400.0,
            multi_rebanada: multi,
            penalizar_franja_muerta: penalize,
            deltas_estructurales: if penalize {
                vec![StructuralDelta { delta: 36.0, n: 3.0 }]
            } else {
                Vec::new()
            },
            contraer_rebanada_real: true,
            family_pool_index: false,
            family_fit_prune: false,
        }
    }

    #[test]
    fn family_pool_index_matches_legacy_candidate_order_and_geometry() {
        // Interleave signatures deliberately. After removing the head of one
        // family, its next representative can move behind another family;
        // this catches implementations that iterate in fixed signature order.
        let inputs = vec![
            test_piece(0, 0, 770.0, 490.0),
            test_piece(1, 1, 950.0, 100.0),
            test_piece(2, 2, 760.0, 70.0),
            test_piece(3, 0, 770.0, 490.0),
            test_piece(4, 3, 864.0, 150.0),
            test_piece(5, 1, 950.0, 100.0),
            test_piece(6, 2, 760.0, 70.0),
            test_piece(7, 4, 453.0, 330.0),
            test_piece(8, 2, 760.0, 70.0),
            test_piece(9, 1, 950.0, 100.0),
            test_piece(10, 5, 354.0, 255.0),
            test_piece(11, 3, 864.0, 150.0),
        ];

        for dir in ["x", "y"] {
            for criterion in ["perp", "exacta", "area", "largo"] {
                for multi in [false, true] {
                    for penalize in [false, true] {
                        for seed in [None, Some(7), Some(1000), Some(20260812)] {
                            let mut legacy = parity_options(dir, criterion, multi, penalize);
                            legacy.family_pool_index = false;
                            legacy.family_fit_prune = false;
                            let a = pack_prepared(&inputs, &legacy, seed).expect("legacy pack");
                            let a_json = serde_json::to_string(&a).expect("serialize legacy");

                            for prune in [false, true] {
                                let mut indexed = legacy.clone();
                                indexed.family_pool_index = true;
                                indexed.family_fit_prune = prune;
                                let b = pack_prepared(&inputs, &indexed, seed).expect("indexed pack");
                                let b_json = serde_json::to_string(&b).expect("serialize indexed");
                                assert_eq!(
                                    a_json, b_json,
                                    "family pool parity failed dir={dir} criterion={criterion} multi={multi} penalize={penalize} prune={prune} seed={seed:?}"
                                );
                            }
                        }
                    }
                }
            }
        }
    }
}
