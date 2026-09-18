use std::cmp::Ordering;
use std::collections::{BTreeSet, HashMap, HashSet};

use napi::{Error, Result, Status};
use napi_derive::napi;
use serde::{Deserialize, Serialize};

const GENERATOR_VERSION: &str = "rust-b01-search-v1";
const COORDINATE_POLICY: &str = "piece-multiples-v1";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Context {
    width: i64,
    height: i64,
    kerf: i64,
    opts: Options,
    types: Vec<PieceType>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Options {
    #[serde(rename = "etapas")]
    stages: u32,
    #[serde(rename = "restoMin")]
    remnant_min: f64,
    #[serde(rename = "restoMax")]
    remnant_max: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PieceType {
    index: usize,
    quantity: u32,
    cut_width: i64,
    cut_height: i64,
    orientations: Vec<Orientation>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Orientation {
    width: i64,
    height: i64,
    rotated: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Limits {
    max_expansions: u64,
    max_and_combinations: u64,
    max_frontier_entries: u64,
    max_materializations: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Axis {
    X,
    Y,
}

impl Axis {
    fn parse(value: &str) -> std::result::Result<Self, String> {
        match value {
            "x" => Ok(Self::X),
            "y" => Ok(Self::Y),
            _ => Err(format!("invalid axis: {value}")),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::X => "x",
            Self::Y => "y",
        }
    }

    fn opposite(self) -> Self {
        match self {
            Self::X => Self::Y,
            Self::Y => Self::X,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct Geometry {
    width: i64,
    height: i64,
    axis: Axis,
    level: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
struct Rect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum CutTree {
    Waste,
    Piece {
        #[serde(rename = "type")]
        type_index: usize,
        rotated: bool,
    },
    Terminal {
        #[serde(rename = "type")]
        type_index: usize,
        rotated: bool,
    },
    Slice {
        axis: String,
        parts: Vec<SlicePart>,
    },
}

#[derive(Debug, Clone, Serialize, PartialEq)]
struct SlicePart {
    size: f64,
    content: Box<CutTree>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Descriptor {
    usage_vector: Vec<u32>,
    used_area: f64,
    cut_tree: CutTree,
    remnants: Vec<Rect>,
    cut_complexity: [f64; 3],
    #[serde(skip_serializing_if = "Option::is_none")]
    root_axis: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct HitCounters {
    max_expansions: u64,
    max_and_combinations: u64,
    max_frontier_entries: u64,
    max_materializations: u64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct UsedCounters {
    expansions: u64,
    and_combinations: u64,
    materializations: u64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Telemetry {
    used: UsedCounters,
    hits: HitCounters,
    frontier_live: u64,
    frontier_peak: u64,
    frontier_inserted: u64,
    replaced: u64,
    cache_hits: u64,
    geometry_states: u64,
    duplicate_entries: u64,
    duplicate_usage_vectors: u64,
    heuristic_pruned: u64,
    coordinate_streams: u64,
    coordinate_proposals: u64,
    duplicate_coordinates: u64,
    and_pairs_considered: u64,
    and_pairs_accepted: u64,
    search_stop_reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeOutput {
    status: String,
    search_restricted: bool,
    restriction_reasons: Vec<String>,
    roots: Vec<Descriptor>,
    telemetry: Telemetry,
    generator_version: String,
    coordinate_policy: String,
}

struct Engine {
    context: Context,
    limits: Limits,
    max_variants: usize,
    memo: HashMap<Geometry, Vec<Descriptor>>,
    telemetry: Telemetry,
}

impl Engine {
    fn new(context: Context, limits: Limits, max_variants: usize) -> Self {
        Self {
            context,
            limits,
            max_variants,
            memo: HashMap::new(),
            telemetry: Telemetry::default(),
        }
    }

    fn stopped(&self) -> bool {
        self.telemetry.search_stop_reason.is_some()
    }

    fn stop(&mut self, reason: &str) {
        if self.telemetry.search_stop_reason.is_none() {
            self.telemetry.search_stop_reason = Some(reason.to_string());
        }
    }

    fn try_expand(&mut self) -> bool {
        if self.stopped() {
            return false;
        }
        if self.telemetry.used.expansions >= self.limits.max_expansions {
            self.telemetry.hits.max_expansions += 1;
            self.stop("maxExpansions");
            return false;
        }
        self.telemetry.used.expansions += 1;
        true
    }

    fn try_combine(&mut self) -> bool {
        if self.stopped() {
            return false;
        }
        if self.telemetry.used.and_combinations >= self.limits.max_and_combinations {
            self.telemetry.hits.max_and_combinations += 1;
            self.stop("maxAndCombinations");
            return false;
        }
        self.telemetry.used.and_combinations += 1;
        self.telemetry.and_pairs_considered += 1;
        true
    }

    fn reserve_frontier(&mut self) -> bool {
        if self.stopped() {
            return false;
        }
        if self.telemetry.frontier_live >= self.limits.max_frontier_entries {
            self.telemetry.hits.max_frontier_entries += 1;
            self.stop("maxFrontierEntries");
            return false;
        }
        self.telemetry.frontier_live += 1;
        self.telemetry.frontier_inserted += 1;
        self.telemetry.frontier_peak = self
            .telemetry
            .frontier_peak
            .max(self.telemetry.frontier_live);
        true
    }

    fn replace_frontier(&mut self) {
        self.telemetry.frontier_inserted += 1;
        self.telemetry.replaced += 1;
    }

    fn generate(&mut self, root_axes: &[Axis]) -> Vec<Descriptor> {
        // B0.1 charges index preparation before root expansion.
        let orientation_count: usize = self
            .context
            .types
            .iter()
            .map(|piece| piece.orientations.len())
            .sum();
        for _ in 0..orientation_count {
            if !self.try_expand() {
                return Vec::new();
            }
        }

        let mut roots = Vec::new();
        for axis in root_axes {
            if self.stopped() {
                break;
            }
            let state = Geometry {
                width: self.context.width,
                height: self.context.height,
                axis: *axis,
                level: 1,
            };
            for mut entry in self.enumerate(state) {
                entry.root_axis = Some(axis.as_str().to_string());
                roots.push(entry);
            }
        }
        roots
    }

    fn enumerate(&mut self, state: Geometry) -> Vec<Descriptor> {
        if let Some(cached) = self.memo.get(&state) {
            self.telemetry.cache_hits += 1;
            return cached.clone();
        }
        if self.stopped() {
            return Vec::new();
        }
        self.telemetry.geometry_states += 1;

        let mut groups: HashMap<Vec<u32>, Vec<Descriptor>> = HashMap::new();

        // Waste.
        if self.try_expand() {
            let waste = Descriptor {
                usage_vector: self.zero_usage(),
                used_area: 0.0,
                cut_tree: CutTree::Waste,
                remnants: vec![self.rect(0, 0, state.width, state.height)],
                cut_complexity: [0.0, 0.0, 0.0],
                root_axis: None,
            };
            self.insert(&mut groups, waste);
        }

        // Exact lookup and exact pieces.
        if self.try_expand() {
            let exact = self.exact_candidates(state);
            for (type_index, orientation) in exact {
                if !self.try_expand() {
                    break;
                }
                let mut usage = self.zero_usage();
                usage[type_index] = 1;
                self.insert(
                    &mut groups,
                    Descriptor {
                        usage_vector: usage,
                        used_area: units_area(orientation.width, orientation.height),
                        cut_tree: CutTree::Piece {
                            type_index,
                            rotated: orientation.rotated,
                        },
                        remnants: Vec::new(),
                        cut_complexity: [0.0, 0.0, 0.0],
                        root_axis: None,
                    },
                );
            }
        }

        if !self.stopped() && state.level > self.context.opts.stages {
            // Terminal lookup belongs to the child immediately beyond the stage ceiling.
            if self.try_expand() {
                let terminals = self.terminal_candidates(state);
                for (type_index, orientation) in terminals {
                    if !self.try_expand() {
                        break;
                    }
                    let mut usage = self.zero_usage();
                    usage[type_index] = 1;
                    let parent_axis = state.axis.opposite();
                    let span = match parent_axis {
                        Axis::X => state.height,
                        Axis::Y => state.width,
                    };
                    let extent = match parent_axis {
                        Axis::X => orientation.height,
                        Axis::Y => orientation.width,
                    };
                    let consumed = span.min(extent + self.context.kerf);
                    let remnants = if consumed == span {
                        Vec::new()
                    } else if parent_axis == Axis::X {
                        vec![self.rect(0, consumed, state.width, span - consumed)]
                    } else {
                        vec![self.rect(consumed, 0, span - consumed, state.height)]
                    };
                    let cut_length_units = if parent_axis == Axis::X {
                        state.width
                    } else {
                        state.height
                    };
                    self.insert(
                        &mut groups,
                        Descriptor {
                            usage_vector: usage,
                            used_area: units_area(orientation.width, orientation.height),
                            cut_tree: CutTree::Terminal {
                                type_index,
                                rotated: orientation.rotated,
                            },
                            remnants,
                            cut_complexity: [
                                1.0,
                                state.level as f64,
                                units(cut_length_units),
                            ],
                            root_axis: None,
                        },
                    );
                }
            }

            let out = flatten_groups(groups);
            if !self.stopped() {
                self.memo.insert(state, out.clone());
            }
            return out;
        }

        if !self.stopped() {
            let proposals = self.coordinate_proposals(state);
            let mut last: Option<i64> = None;
            for thickness in proposals {
                if !self.try_expand() {
                    break;
                }
                self.telemetry.coordinate_proposals += 1;
                if last == Some(thickness) {
                    self.telemetry.duplicate_coordinates += 1;
                    continue;
                }
                last = Some(thickness);

                let span = match state.axis {
                    Axis::X => state.width,
                    Axis::Y => state.height,
                };
                if thickness <= 0 || thickness > span {
                    continue;
                }
                let remaining = (span
                    - thickness
                    - if thickness < span {
                        self.context.kerf
                    } else {
                        0
                    })
                .max(0);

                let child = Geometry {
                    width: if state.axis == Axis::X {
                        thickness
                    } else {
                        state.width
                    },
                    height: if state.axis == Axis::Y {
                        thickness
                    } else {
                        state.height
                    },
                    axis: state.axis.opposite(),
                    level: state.level + 1,
                };
                let left_entries = self.enumerate(child);
                if self.stopped() {
                    break;
                }

                let right_entries = if remaining > 0 {
                    let tail = Geometry {
                        width: if state.axis == Axis::X {
                            remaining
                        } else {
                            state.width
                        },
                        height: if state.axis == Axis::Y {
                            remaining
                        } else {
                            state.height
                        },
                        axis: state.axis,
                        level: state.level,
                    };
                    self.enumerate(tail)
                } else {
                    vec![self.empty()]
                };

                if self.stopped() {
                    break;
                }

                'pairs: for left in &left_entries {
                    for right in &right_entries {
                        if !self.try_combine() {
                            break 'pairs;
                        }
                        if let Some(combined) =
                            self.combine(state, thickness, remaining, left, right)
                        {
                            self.telemetry.and_pairs_accepted += 1;
                            self.insert(&mut groups, combined);
                            if self.stopped() {
                                break 'pairs;
                            }
                        }
                    }
                }
                if self.stopped() {
                    break;
                }
            }
        }

        let out = flatten_groups(groups);
        if !self.stopped() {
            self.memo.insert(state, out.clone());
        }
        out
    }

    fn zero_usage(&self) -> Vec<u32> {
        vec![0; self.context.types.len()]
    }

    fn empty(&self) -> Descriptor {
        Descriptor {
            usage_vector: self.zero_usage(),
            used_area: 0.0,
            cut_tree: CutTree::Waste,
            remnants: Vec::new(),
            cut_complexity: [0.0, 0.0, 0.0],
            root_axis: None,
        }
    }

    fn rect(&self, x: i64, y: i64, w: i64, h: i64) -> Rect {
        Rect {
            x: units(x),
            y: units(y),
            w: units(w),
            h: units(h),
        }
    }

    fn exact_candidates(&self, state: Geometry) -> Vec<(usize, Orientation)> {
        let mut out = Vec::new();
        for piece in &self.context.types {
            for orientation in &piece.orientations {
                if orientation.width == state.width && orientation.height == state.height {
                    out.push((piece.index, orientation.clone()));
                }
            }
        }
        out
    }

    fn terminal_candidates(&self, state: Geometry) -> Vec<(usize, Orientation)> {
        let parent_axis = state.axis.opposite();
        let mut out = Vec::new();
        for piece in &self.context.types {
            for orientation in &piece.orientations {
                let fits = match parent_axis {
                    Axis::X => {
                        orientation.width == state.width && orientation.height < state.height
                    }
                    Axis::Y => {
                        orientation.height == state.height && orientation.width < state.width
                    }
                };
                if fits {
                    out.push((piece.index, orientation.clone()));
                }
            }
        }
        out
    }

    fn coordinate_proposals(&mut self, state: Geometry) -> Vec<i64> {
        let span = match state.axis {
            Axis::X => state.width,
            Axis::Y => state.height,
        };
        let kerf = self.context.kerf;
        let mut proposals = Vec::new();
        let types = self.context.types.clone();
        for piece in &types {
            for orientation in &piece.orientations {
                if !self.try_expand() {
                    return proposals;
                }
                self.telemetry.coordinate_streams += 1;
                let dimension = match state.axis {
                    Axis::X => orientation.width,
                    Axis::Y => orientation.height,
                };
                for n in 1..=piece.quantity as i64 {
                    let cut = n * dimension + (n - 1) * kerf;
                    if cut > span {
                        break;
                    }
                    proposals.push(cut);
                    let complement = span - cut - kerf;
                    if complement > 0 {
                        proposals.push(complement);
                    }
                }
            }
        }
        proposals.sort_unstable();
        proposals
    }

    fn combine(
        &self,
        state: Geometry,
        thickness: i64,
        remaining: i64,
        left: &Descriptor,
        right: &Descriptor,
    ) -> Option<Descriptor> {
        let mut usage = Vec::with_capacity(self.context.types.len());
        for (index, piece) in self.context.types.iter().enumerate() {
            let value = left.usage_vector[index] + right.usage_vector[index];
            if value > piece.quantity {
                return None;
            }
            usage.push(value);
        }

        let span = match state.axis {
            Axis::X => state.width,
            Axis::Y => state.height,
        };
        let cut = thickness < span;
        let consumed = span.min(
            thickness
                + if cut {
                    self.context.kerf
                } else {
                    0
                },
        );

        let mut parts = vec![SlicePart {
            size: units(thickness),
            content: Box::new(left.cut_tree.clone()),
        }];
        match &right.cut_tree {
            CutTree::Slice { parts: tail, .. } => parts.extend(tail.clone()),
            CutTree::Piece { .. } => parts.push(SlicePart {
                size: units(remaining),
                content: Box::new(right.cut_tree.clone()),
            }),
            _ => {}
        }

        let mut remnants = left.remnants.clone();
        for remnant in &right.remnants {
            let mut shifted = remnant.clone();
            if state.axis == Axis::X {
                shifted.x += units(consumed);
            } else {
                shifted.y += units(consumed);
            }
            remnants.push(shifted);
        }

        let mut area_units: i128 = 0;
        for (index, count) in usage.iter().enumerate() {
            area_units += *count as i128
                * self.context.types[index].cut_width as i128
                * self.context.types[index].cut_height as i128;
        }
        let perpendicular = match state.axis {
            Axis::X => state.height,
            Axis::Y => state.width,
        };
        let total_cut_length = left.cut_complexity[2]
            + right.cut_complexity[2]
            + if cut { units(perpendicular) } else { 0.0 };

        Some(Descriptor {
            usage_vector: usage,
            used_area: area_units as f64 / 1_000_000.0,
            cut_tree: CutTree::Slice {
                axis: state.axis.as_str().to_string(),
                parts,
            },
            remnants,
            cut_complexity: [
                left.cut_complexity[0] + right.cut_complexity[0] + if cut { 1.0 } else { 0.0 },
                left.cut_complexity[1]
                    .max(right.cut_complexity[1])
                    .max(if cut { state.level as f64 } else { 0.0 }),
                total_cut_length,
            ],
            root_axis: None,
        })
    }

    fn insert(
        &mut self,
        groups: &mut HashMap<Vec<u32>, Vec<Descriptor>>,
        candidate: Descriptor,
    ) {
        if self.stopped() {
            return;
        }
        let usage = candidate.usage_vector.clone();
        let group = groups.entry(usage).or_default();
        if !group.is_empty() {
            self.telemetry.duplicate_usage_vectors += 1;
        }
        let candidate_signature = signature(&candidate);
        if group.iter().any(|existing| signature(existing) == candidate_signature) {
            self.telemetry.duplicate_entries += 1;
            return;
        }

        if group.len() < self.max_variants {
            if self.reserve_frontier() {
                group.push(candidate);
            }
            return;
        }

        self.telemetry.heuristic_pruned += 1;
        let mut all = group.clone();
        all.push(candidate.clone());
        all.sort_by(|a, b| compare_descriptors(a, b, &self.context.opts));

        let mut shapes = HashSet::new();
        let mut selected = Vec::new();
        for item in &all {
            let shape = serde_json::to_string(&item.remnants).unwrap_or_default();
            if shapes.insert(shape) {
                selected.push(item.clone());
                if selected.len() == self.max_variants {
                    break;
                }
            }
        }
        if selected.len() < self.max_variants {
            let selected_sigs: HashSet<String> = selected.iter().map(signature).collect();
            for item in &all {
                if selected.len() == self.max_variants {
                    break;
                }
                if !selected_sigs.contains(&signature(item)) {
                    selected.push(item.clone());
                }
            }
        }

        if selected.iter().any(|item| signature(item) == candidate_signature) {
            *group = selected;
            self.replace_frontier();
        }
    }
}

fn flatten_groups(groups: HashMap<Vec<u32>, Vec<Descriptor>>) -> Vec<Descriptor> {
    let mut out: Vec<Descriptor> = groups.into_values().flatten().collect();
    out.sort_by(|a, b| signature(a).cmp(&signature(b)));
    out
}

fn signature(value: &Descriptor) -> String {
    serde_json::to_string(&(
        &value.usage_vector,
        &value.cut_tree,
        value.used_area,
        &value.remnants,
        value.cut_complexity,
    ))
    .unwrap_or_default()
}

#[derive(Debug)]
struct Quality {
    largest: f64,
    second: f64,
    fragments: usize,
    total: f64,
}

fn remnant_quality(remnants: &[Rect], opts: &Options) -> Quality {
    let mut areas = Vec::new();
    let mut total = 0.0;
    for rect in remnants {
        if rect.w.min(rect.h) >= opts.remnant_min && rect.w.max(rect.h) >= opts.remnant_max {
            let area = rect.w * rect.h;
            areas.push(area);
            total += area;
        }
    }
    areas.sort_by(|a, b| b.total_cmp(a));
    Quality {
        largest: areas.first().copied().unwrap_or(0.0),
        second: areas.get(1).copied().unwrap_or(0.0),
        fragments: areas.len(),
        total,
    }
}

fn compare_descriptors(a: &Descriptor, b: &Descriptor, opts: &Options) -> Ordering {
    let qa = remnant_quality(&a.remnants, opts);
    let qb = remnant_quality(&b.remnants, opts);

    qb.largest
        .total_cmp(&qa.largest)
        .then_with(|| qb.second.total_cmp(&qa.second))
        .then_with(|| qa.fragments.cmp(&qb.fragments))
        .then_with(|| qb.total.total_cmp(&qa.total))
        .then_with(|| lex_f64(&a.cut_complexity, &b.cut_complexity))
        .then_with(|| signature(a).cmp(&signature(b)))
}

fn lex_f64(a: &[f64; 3], b: &[f64; 3]) -> Ordering {
    a[0]
        .total_cmp(&b[0])
        .then_with(|| a[1].total_cmp(&b[1]))
        .then_with(|| a[2].total_cmp(&b[2]))
}

fn units(value: i64) -> f64 {
    value as f64 / 1000.0
}

fn units_area(width: i64, height: i64) -> f64 {
    width as f64 * height as f64 / 1_000_000.0
}

fn validate(context: &Context, limits: &Limits, max_variants: usize) -> std::result::Result<(), String> {
    if context.width <= 0 || context.height <= 0 || context.kerf < 0 {
        return Err("invalid context geometry".into());
    }
    if context.types.is_empty() {
        return Err("context requires piece types".into());
    }
    if context.opts.stages == 0 || context.opts.stages > 8 {
        return Err("invalid stage ceiling".into());
    }
    if max_variants == 0 {
        return Err("maxVariantsPerUsageVector must be positive".into());
    }
    if limits.max_expansions == 0
        || limits.max_and_combinations == 0
        || limits.max_frontier_entries == 0
        || limits.max_materializations == 0
    {
        return Err("all work limits must be positive".into());
    }
    for (expected, piece) in context.types.iter().enumerate() {
        if piece.index != expected || piece.quantity == 0 || piece.cut_width <= 0 || piece.cut_height <= 0 {
            return Err("invalid type catalog".into());
        }
        if piece.orientations.is_empty()
            || piece
                .orientations
                .iter()
                .any(|o| o.width <= 0 || o.height <= 0)
        {
            return Err("invalid orientation catalog".into());
        }
    }
    Ok(())
}

#[napi(js_name = "generateRoots")]
pub fn generate_roots(
    context_json: String,
    limits_json: String,
    max_variants_per_usage_vector: u32,
    root_axes_json: String,
) -> Result<String> {
    let context: Context = serde_json::from_str(&context_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid context JSON: {e}")))?;
    let limits: Limits = serde_json::from_str(&limits_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid limits JSON: {e}")))?;
    let axis_names: Vec<String> = serde_json::from_str(&root_axes_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid root axes JSON: {e}")))?;
    if axis_names.is_empty() || axis_names.len() > 2 {
        return Err(Error::new(Status::InvalidArg, "root axes must contain one or two axes".to_string()));
    }
    let mut seen = BTreeSet::new();
    let mut axes = Vec::new();
    for name in &axis_names {
        if !seen.insert(name.clone()) {
            return Err(Error::new(Status::InvalidArg, "duplicate root axis".to_string()));
        }
        axes.push(Axis::parse(name).map_err(|e| Error::new(Status::InvalidArg, e))?);
    }

    let max_variants = max_variants_per_usage_vector as usize;
    validate(&context, &limits, max_variants)
        .map_err(|e| Error::new(Status::InvalidArg, e))?;

    let mut engine = Engine::new(context, limits, max_variants);
    let roots = engine.generate(&axes);
    let mut reasons = vec![COORDINATE_POLICY.to_string()];
    if engine.telemetry.heuristic_pruned > 0 {
        reasons.push("maxVariantsPerUsageVector".to_string());
    }
    if axes.len() != 2 {
        reasons.push("root-axis-subset".to_string());
    }
    let status = if engine.stopped() {
        "WORK_LIMIT"
    } else {
        "COMPLETE"
    };

    serde_json::to_string(&NativeOutput {
        status: status.to_string(),
        search_restricted: true,
        restriction_reasons: reasons,
        roots,
        telemetry: engine.telemetry,
        generator_version: GENERATOR_VERSION.to_string(),
        coordinate_policy: COORDINATE_POLICY.to_string(),
    })
    .map_err(|e| Error::new(Status::GenericFailure, format!("serialize native output: {e}")))
}


const LEGACY_OUTER_VERSION: &str = "rust-legacy-pattern-outer-v1";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyPlacementInput {
    type_index: Option<usize>,
    base: f64,
    altura: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyBoardCandidateInput {
    payload_index: u32,
    placements: Vec<LegacyPlacementInput>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LegacySelectedPattern {
    payload_index: u32,
    usage_vector: Vec<u32>,
    area: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LegacyRoundSchedule {
    version: &'static str,
    rounds: Vec<Vec<u32>>,
}

#[napi(js_name = "legacyRoundSubsets")]
pub fn legacy_round_subsets(line_count: u32, rounds: u32, seed: u32) -> Result<String> {
    let mut state = seed;
    let mut next_random = || {
        state = state.wrapping_mul(1_103_515_245).wrapping_add(12_345);
        (state & 0x7fff_ffff) as f64 / 2_147_483_647_f64
    };

    let mut schedule = Vec::with_capacity(rounds as usize);
    for round in 0..rounds {
        if round == 0 {
            schedule.push((0..line_count).collect());
            continue;
        }
        let mut subset = Vec::new();
        for index in 0..line_count {
            if next_random() > 0.45 {
                subset.push(index);
            }
        }
        schedule.push(subset);
    }

    serde_json::to_string(&LegacyRoundSchedule {
        version: LEGACY_OUTER_VERSION,
        rounds: schedule,
    })
    .map_err(|e| Error::new(Status::GenericFailure, format!("serialize legacy schedule: {e}")))
}

#[napi(js_name = "legacyDedupBoards")]
pub fn legacy_dedup_boards(candidates_json: String, line_count: u32) -> Result<String> {
    let candidates: Vec<LegacyBoardCandidateInput> = serde_json::from_str(&candidates_json)
        .map_err(|e| Error::new(Status::InvalidArg, format!("invalid legacy candidates JSON: {e}")))?;

    let mut selected: Vec<LegacySelectedPattern> = Vec::new();
    let mut position_by_key: HashMap<String, usize> = HashMap::new();

    for candidate in candidates {
        let mut usage = vec![0_u32; line_count as usize];
        let mut area = 0_f64;
        let mut valid = true;

        for placement in candidate.placements {
            let Some(type_index) = placement.type_index else {
                valid = false;
                break;
            };
            if type_index >= usage.len() || !placement.base.is_finite() || !placement.altura.is_finite() {
                valid = false;
                break;
            }
            usage[type_index] = usage[type_index].saturating_add(1);
            area += placement.base * placement.altura;
        }

        if !valid || usage.iter().all(|value| *value == 0) {
            continue;
        }

        let mut key = String::new();
        for (index, value) in usage.iter().enumerate() {
            if *value > 0 {
                key.push_str(&format!("{index}:{value},"));
            }
        }

        if let Some(slot) = position_by_key.get(&key).copied() {
            if area > selected[slot].area {
                selected[slot] = LegacySelectedPattern {
                    payload_index: candidate.payload_index,
                    usage_vector: usage,
                    area,
                };
            }
        } else {
            position_by_key.insert(key, selected.len());
            selected.push(LegacySelectedPattern {
                payload_index: candidate.payload_index,
                usage_vector: usage,
                area,
            });
        }
    }

    serde_json::to_string(&selected)
        .map_err(|e| Error::new(Status::GenericFailure, format!("serialize legacy patterns: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coordinate_policy_preserves_direct_and_complement_positions() {
        let context = Context {
            width: 2500,
            height: 1000,
            kerf: 500,
            opts: Options { stages: 1, remnant_min: 100.0, remnant_max: 100.0 },
            types: vec![PieceType {
                index: 0,
                quantity: 3,
                cut_width: 1000,
                cut_height: 1000,
                orientations: vec![Orientation { width: 1000, height: 1000, rotated: false }],
            }],
        };
        let limits = Limits {
            max_expansions: 1000,
            max_and_combinations: 1000,
            max_frontier_entries: 1000,
            max_materializations: 1000,
        };
        let mut engine = Engine::new(context, limits, 100);
        let proposals = engine.coordinate_proposals(Geometry {
            width: 2500,
            height: 1000,
            axis: Axis::X,
            level: 1,
        });
        assert!(proposals.contains(&1000));
        assert!(proposals.contains(&2500));
    }
}
