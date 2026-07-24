import type { SkillCluster } from './vocab';
import raw from './atlas-region-groups.json';

/**
 * Evidence Atlas region config (the 15 anatomical lesson-groups).
 *
 * Source of truth: `atlas-region-groups.json` — copied verbatim from the design
 * archive (`brain_region_groups.json`). It partitions all 114 V3 lessons into 15
 * regions by AAMC Foundational Concept (NOT the app's 15 skill clusters), each
 * anchored to a brain part + hemisphere and sized by `area_share`. See
 * `BRAIN_REGION_GROUPS.md` for the rationale.
 */

export type AtlasBrainPart =
  | 'frontal_lobe'
  | 'temporal_lobe'
  | 'parietal_lobe'
  | 'occipital_lobe'
  | 'cerebellum'
  | 'central_white_matter'
  | 'brainstem';

export type AtlasHemisphere = 'left' | 'right' | 'midline';

export interface AtlasRegionLesson {
  readonly lesson_id: string;
  readonly title: string;
  readonly kcs: number;
  readonly cat: string;
  readonly fc: string;
  readonly section: string;
}

export interface AtlasRegionGroup {
  readonly region_id: string;
  readonly name: string;
  readonly source_fc: string;
  readonly lesson_ids: readonly string[];
  readonly lesson_count: number;
  readonly kc_count: number;
  /** Share of the 114 lessons, in percent — drives on-model region size. */
  readonly area_share: number;
  readonly brain_part: AtlasBrainPart;
  readonly hemisphere: AtlasHemisphere;
  readonly brain_subregion: string;
  readonly lessons: readonly AtlasRegionLesson[];
}

export interface AtlasRegionGroupsFile {
  readonly schema_version: string;
  readonly region_count: number;
  readonly lesson_total: number;
  readonly kc_total: number;
  readonly regions: readonly AtlasRegionGroup[];
}

const file = raw as unknown as AtlasRegionGroupsFile;

/** The 15 Evidence Atlas regions, in canonical R01…R15 order. */
export const ATLAS_REGION_GROUPS: readonly AtlasRegionGroup[] = file.regions;

/**
 * lesson_id → app skill cluster.
 *
 * Baked from the canonical `@mcat/content` `LESSON_TO_CLUSTER` (114 lessons, zero
 * gaps). `contracts` is a pure layer and cannot depend on `@mcat/content`, so the
 * mapping is duplicated here as static data. It exists ONLY to bridge the atlas'
 * lesson-group partition to today's cluster-keyed mastery signal (`getMasteryMap`)
 * until a per-lesson completion source exists (see the atlas "future steps").
 */
export const ATLAS_LESSON_CLUSTER: Readonly<Record<string, SkillCluster>> = {
  'V3-LES-006619': 'BB3',
  'V3-LES-018986': 'BB4',
  'V3-LES-020428': 'CP2',
  'V3-LES-034099': 'BB3',
  'V3-LES-041222': 'CP3',
  'V3-LES-044045': 'BB2',
  'V3-LES-053947': 'PS2',
  'V3-LES-067950': 'CP3',
  'V3-LES-078488': 'PS2',
  'V3-LES-083939': 'PS2',
  'V3-LES-094421': 'CP1',
  'V3-LES-095827': 'CA2',
  'V3-LES-128144': 'R2',
  'V3-LES-130923': 'R1',
  'V3-LES-134007': 'PS3',
  'V3-LES-137490': 'BB2',
  'V3-LES-149941': 'PS2',
  'V3-LES-151730': 'CP3',
  'V3-LES-153695': 'PS2',
  'V3-LES-156118': 'PS2',
  'V3-LES-163162': 'BB4',
  'V3-LES-180117': 'PS3',
  'V3-LES-191915': 'CP3',
  'V3-LES-191933': 'CA2',
  'V3-LES-199474': 'CP3',
  'V3-LES-207028': 'BB1',
  'V3-LES-207222': 'CP2',
  'V3-LES-217547': 'CA2',
  'V3-LES-222431': 'BB2',
  'V3-LES-225658': 'PS2',
  'V3-LES-228369': 'PS3',
  'V3-LES-251056': 'BB2',
  'V3-LES-252091': 'BB3',
  'V3-LES-253783': 'PS3',
  'V3-LES-258629': 'CP2',
  'V3-LES-263440': 'CP3',
  'V3-LES-264096': 'BB1',
  'V3-LES-264240': 'R2',
  'V3-LES-269427': 'CA2',
  'V3-LES-275615': 'R3',
  'V3-LES-282413': 'BB1',
  'V3-LES-310043': 'BB1',
  'V3-LES-315313': 'CP3',
  'V3-LES-320512': 'CP2',
  'V3-LES-323416': 'CP2',
  'V3-LES-329622': 'BB1',
  'V3-LES-338400': 'CP1',
  'V3-LES-340525': 'BB1',
  'V3-LES-349092': 'BB1',
  'V3-LES-385880': 'PS3',
  'V3-LES-386478': 'CA2',
  'V3-LES-403395': 'PS3',
  'V3-LES-404423': 'PS3',
  'V3-LES-416343': 'BB1',
  'V3-LES-443492': 'CP2',
  'V3-LES-467188': 'PS3',
  'V3-LES-469875': 'BB2',
  'V3-LES-473390': 'PS2',
  'V3-LES-474771': 'BB3',
  'V3-LES-485905': 'BB1',
  'V3-LES-489818': 'BB3',
  'V3-LES-495267': 'PS3',
  'V3-LES-505131': 'CA1',
  'V3-LES-515867': 'BB2',
  'V3-LES-522245': 'CP2',
  'V3-LES-540203': 'CP2',
  'V3-LES-546762': 'BB2',
  'V3-LES-548488': 'PS2',
  'V3-LES-556584': 'CA1',
  'V3-LES-560768': 'CP3',
  'V3-LES-563427': 'CP2',
  'V3-LES-567976': 'CP2',
  'V3-LES-580395': 'BB2',
  'V3-LES-603825': 'BB2',
  'V3-LES-615860': 'CP1',
  'V3-LES-619870': 'BB4',
  'V3-LES-623852': 'CP3',
  'V3-LES-631070': 'CA1',
  'V3-LES-631100': 'BB1',
  'V3-LES-684434': 'CP2',
  'V3-LES-697045': 'CP1',
  'V3-LES-704363': 'BB3',
  'V3-LES-705241': 'PS2',
  'V3-LES-710436': 'BB4',
  'V3-LES-712077': 'PS2',
  'V3-LES-715826': 'BB4',
  'V3-LES-726940': 'CP2',
  'V3-LES-765609': 'R3',
  'V3-LES-771227': 'PS3',
  'V3-LES-772297': 'PS3',
  'V3-LES-773665': 'CP1',
  'V3-LES-774232': 'CP2',
  'V3-LES-774377': 'PS2',
  'V3-LES-781935': 'PS3',
  'V3-LES-788522': 'CP1',
  'V3-LES-789208': 'R1',
  'V3-LES-801639': 'BB3',
  'V3-LES-804390': 'BB1',
  'V3-LES-811780': 'CP1',
  'V3-LES-817478': 'PS2',
  'V3-LES-825706': 'CP3',
  'V3-LES-839816': 'BB2',
  'V3-LES-841417': 'PS3',
  'V3-LES-844372': 'R1',
  'V3-LES-865559': 'BB2',
  'V3-LES-867084': 'CA1',
  'V3-LES-895906': 'PS2',
  'V3-LES-915978': 'CP3',
  'V3-LES-930899': 'CP3',
  'V3-LES-932938': 'BB1',
  'V3-LES-949725': 'PS3',
  'V3-LES-953302': 'PS2',
  'V3-LES-959228': 'PS3',
  'V3-LES-990746': 'BB1',
};
