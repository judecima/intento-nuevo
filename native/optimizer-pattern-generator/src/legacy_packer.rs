use std::cmp::Ordering;
use std::collections::HashMap;

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

#[derive(Debug, Clone)]
struct Piece {
    id: u32,
    base: f64,
    altura: f64,
    cut_base: f64,
    cut_altura: f64,
    veta: bool,
    sig: u32,
    detalle: String,
    ref_value: serde_json::Value,
    orientations: Vec<Orientation>,
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
    ref_value: serde_json::Value,
    detalle: String,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PackOutput {
    colocadas: Vec<Placed>,
    cortes: Vec<Cut>,
    restos: Vec<Rest>,
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

fn make_orientations(piece: &PieceInput, material_with_grain: bool) -> Vec<Orientation> {
    let base = Orientation { base: piece.cut_base, altura: piece.cut_altura, rotada: false };
    if (material_with_grain && piece.veta) || (piece.cut_base - piece.cut_altura).abs() < EPS {
        vec![base]
    } else {
        vec![
            base,
            Orientation { base: piece.cut_altura, altura: piece.cut_base, rotada: true },
        ]
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
) -> Option<Candidate> {
    let criterion = if !opts.criterios.is_empty() {
        &opts.criterios[usize::min(level.saturating_sub(1) as usize, opts.criterios.len() - 1)]
    } else {
        &opts.criterio
    };
    let en_x = region.dir == Axis::X;

    let mut counts: HashMap<u32, usize> = HashMap::new();
    let mut reps: Vec<(usize, &Piece)> = Vec::new();
    for (index, piece) in pool.iter().enumerate() {
        if let Some(count) = counts.get_mut(&piece.sig) {
            *count += 1;
        } else {
            counts.insert(piece.sig, 1);
            reps.push((index, piece));
        }
    }

    let mut measures = Vec::new();
    if opts.multi_rebanada && level < opts.etapas {
        for (_, piece) in &reps {
            for orientation in &piece.orientations {
                measures.push(if en_x { orientation.base } else { orientation.altura });
            }
        }
    }

    let mut top: Vec<Candidate> = Vec::with_capacity(3);

    for (rep_index, piece) in &reps {
        let available = *counts.get(&piece.sig).unwrap_or(&1);
        for orientation in &piece.orientations {
            let a = if en_x { orientation.base } else { orientation.altura };
            let b = if en_x { orientation.altura } else { orientation.base };
            if a > remaining + EPS || b > perp + EPS { continue; }
            let sobra = perp - b;

            let mut riesgo = 0.0;
            if opts.penalizar_franja_muerta && level <= 2 {
                let area_candidate = a * b;
                for (_, other) in &reps {
                    let q_count = *counts.get(&other.sig).unwrap_or(&1) as f64;
                    for qo in &other.orientations {
                        let d = if en_x { qo.base } else { qo.altura };
                        let qb = if en_x { qo.altura } else { qo.base };
                        if qb > perp + EPS || d >= a - EPS { continue; }
                        let residual = a - d;
                        if residual <= opts.sierra.max(10.0) || residual >= opts.resto_min { continue; }
                        let q_area = d * qb;
                        if q_area > area_candidate * 1.05 {
                            riesgo = riesgo.max(residual * q_area * q_count);
                        }
                        if opts.deltas_estructurales.iter().any(|x| (x.delta - residual).abs() <= 0.6)
                            && (qb - b).abs() <= (opts.sierra + 0.5).max(1.0)
                        {
                            let repeat = opts.deltas_estructurales.iter()
                                .find(|x| (x.delta - residual).abs() <= 0.6)
                                .map(|x| x.n)
                                .unwrap_or(2.0)
                                .max(2.0);
                            riesgo = riesgo.max(residual * area_candidate.max(q_area) * repeat * q_count);
                        }
                    }
                }
            }

            let mut insert = |candidate: Candidate, top: &mut Vec<Candidate>| {
                let pos = top.iter().position(|existing| candidate_better(&candidate, existing, opts, level, criterion));
                match pos {
                    Some(i) => top.insert(i, candidate),
                    None => top.push(candidate),
                }
                if top.len() > 3 { top.truncate(3); }
            };

            insert(Candidate {
                index: *rep_index,
                orientation: *orientation,
                a,
                b,
                sobra,
                exacta: if sobra < EPS { 0 } else { 1 },
                area: a * b,
                mult: 1,
                riesgo_franja: riesgo,
            }, &mut top);

            if opts.multi_rebanada && level < opts.etapas && available >= 2 {
                for mult in 2..=usize::min(3, available) {
                    let thickness = mult as f64 * a + (mult as f64 - 1.0) * opts.sierra;
                    if thickness > remaining + EPS { continue; }
                    let useful = measures.iter().any(|d| *d > a + EPS && *d <= thickness + EPS);
                    if !useful { continue; }
                    insert(Candidate {
                        index: *rep_index,
                        orientation: *orientation,
                        a: thickness,
                        b,
                        sobra,
                        exacta: 1,
                        area: thickness * b,
                        mult: mult as u32,
                        riesgo_franja: 0.0,
                    }, &mut top);
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

fn fill(
    region: Region,
    pool: &mut Vec<Piece>,
    placed: &mut Vec<Placed>,
    level: u32,
    opts: &PackOptions,
    rng: &mut Option<Rng>,
    cuts: &mut Vec<Cut>,
    rests: &mut Vec<Rest>,
) {
    let perp = region.perp();
    let total = region.length();
    let mut pos = 0.0;

    while pos < total - EPS {
        let selected = match choose(pool, region, total - pos, perp, opts, rng.as_mut(), level) {
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
            let piece = pool.remove(selected.index);
            placed.push(Placed {
                id: piece.id,
                ref_value: piece.ref_value.clone(),
                detalle: piece.detalle.clone(),
                x: block.x,
                y: block.y,
                base: selected.orientation.base,
                altura: selected.orientation.altura,
                rotada: selected.orientation.rotada,
                nivel: level,
            });

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

            fill(sub, pool, placed, level + 1, opts, rng, cuts, rests);

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
                    thickness = used;
                    if region.dir == Axis::X { block.w = thickness; } else { block.h = thickness; }
                }
            }
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

#[napi(js_name = "packBoardLegacyCore")]
pub fn pack_board_legacy_core(pieces_json: String, options_json: String, random_seed: Option<u32>) -> Result<String> {
    let inputs: Vec<PieceInput> = serde_json::from_str(&pieces_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid piece JSON: {e}")))?;
    let opts: PackOptions = serde_json::from_str(&options_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid pack options JSON: {e}")))?;
    if opts.ancho_util <= 0.0 || opts.alto_util <= 0.0 || opts.sierra < 0.0 || opts.etapas == 0 {
        return Err(Error::new(Status::InvalidArg, "invalid pack geometry".to_string()));
    }
    let dir = Axis::parse(&opts.dir_inicial).map_err(|e| Error::new(Status::InvalidArg, e))?;

    let mut pool: Vec<Piece> = inputs.iter().map(|input| Piece {
        id: input.id,
        base: input.base,
        altura: input.altura,
        cut_base: input.cut_base,
        cut_altura: input.cut_altura,
        veta: input.veta,
        sig: input.sig,
        detalle: input.detalle.clone(),
        ref_value: input.ref_value.clone(),
        orientations: make_orientations(input, opts.material_con_veta),
    }).collect();

    let mut rng = random_seed.map(Rng::new);
    let mut placed = Vec::new();
    let mut cuts = Vec::new();
    let mut rests = Vec::new();
    let region = Region { x: 0.0, y: 0.0, w: opts.ancho_util, h: opts.alto_util, dir };
    fill(region, &mut pool, &mut placed, 1, &opts, &mut rng, &mut cuts, &mut rests);
    cuts.sort_by(|a, b| a.nivel.cmp(&b.nivel));

    let area = placed.iter().map(|item| item.base * item.altura).sum();
    let area_resto = rests.iter().filter(|rest| useful(rest, &opts)).map(|rest| rest.w * rest.h).sum();

    serde_json::to_string(&PackOutput { colocadas: placed, cortes: cuts, restos: rests, area, area_resto })
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
}
