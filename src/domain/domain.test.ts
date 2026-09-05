import { describe, expect, it } from "vitest";
import {
  doorAudioLinkName,
  joaat,
  parseNametable,
  nametableBytes,
} from "@/domain/audio";
import {
  mergeTuningFiles,
  newTuningItem,
  parseTuning,
  setDoorMapping,
  updateTuningValues,
} from "@/domain/tuning";
import { setText, textOf, validateXml } from "@/lib/xml";

function tuningItem(name: string): string {
  return `  <Item>
   <Name>${name}</Name>
   <Tuning>
    <AutoOpenVolumeOffset x="0" y="0" z="0" />
    <Flags>0</Flags>
    <AutoOpenRadiusModifier value="1.0" />
    <AutoOpenRate value="1.0" />
    <AutoOpenCosineAngleBetweenThreshold value="0.0" />
    <AutoOpenCloseRateTaper value="false" />
    <UseAutoOpenTriggerBox value="false" />
    <CustomTriggerBox value="false" />
    <TriggerBoxMinMax>
     <min x="0" y="0" z="0" />
     <max x="1" y="1" z="1" />
    </TriggerBoxMinMax>
    <BreakableByVehicle value="false" />
    <BreakingImpulse value="0.0" />
    <ShouldLatchShut value="false" />
    <MassMultiplier value="1.0" />
    <WeaponImpulseMultiplier value="1.0" />
    <RotationLimitAngle value="0.0" />
    <TorqueAngularVelocityLimit value="0.0" />
    <StdDoorRotDir>DOOR_ROT_DIR_DONT_CHANGE</StdDoorRotDir>
   </Tuning>
  </Item>`;
}

function mapItem(model: string, tuning: string): string {
  return `  <Item>
   <ModelName>${model}</ModelName>
   <TuningName>${tuning}</TuningName>
  </Item>`;
}

const SAMPLE_TUNING = `<?xml version="1.0" encoding="UTF-8"?>
<CDoorTuningFile>
 <NamedTuningArray>
${tuningItem("base_door")}
${tuningItem("shop_door")}
 </NamedTuningArray>
 <ModelToTuneMapping>
${mapItem("prop_door_a", "base_door")}
 </ModelToTuneMapping>
</CDoorTuningFile>
`;

const INCOMING_TUNING = `<?xml version="1.0" encoding="UTF-8"?>
<CDoorTuningFile>
 <NamedTuningArray>
${tuningItem("shop_door")}
${tuningItem("new_door")}
 </NamedTuningArray>
 <ModelToTuneMapping>
${mapItem("prop_door_a", "shop_door")}
${mapItem("prop_door_b", "new_door")}
 </ModelToTuneMapping>
</CDoorTuningFile>
`;

describe("joaat / doorAudioLinkName", () => {
  it("hashes known stems stably", () => {
    expect(joaat("test")).toMatch(/^[0-9a-f]{8}$/);
    expect(joaat("Test")).toBe(joaat("test"));
    expect(doorAudioLinkName("d_shop_front")).toBe(
      `dasl_${joaat("shop_front")}`,
    );
    expect(doorAudioLinkName("shop_front")).toBe(`dasl_${joaat("shop_front")}`);
  });
});

describe("xml helpers", () => {
  it("validates doortuning root", () => {
    expect(() => validateXml(SAMPLE_TUNING, "CDoorTuningFile")).not.toThrow();
    expect(() => validateXml("<foo/>", "CDoorTuningFile")).toThrow(
      /Not a doortuning/,
    );
  });

  it("reads tag text", () => {
    expect(textOf("<Name>hello</Name>", "Name")).toBe("hello");
  });

  it("setText expands self-closing tags", () => {
    expect(setText("<Flags />", "Flags", "DontCloseWhenTouched")).toBe(
      "<Flags>DontCloseWhenTouched</Flags>",
    );
    expect(setText("<Flags/>", "Flags", "A B")).toBe("<Flags>A B</Flags>");
  });
});

describe("parseTuning / mergeTuningFiles", () => {
  it("parses tunings and mappings", () => {
    const doc = parseTuning(SAMPLE_TUNING);
    expect(doc.tunings.map((t) => t.name)).toEqual(["base_door", "shop_door"]);
    expect(doc.maps).toEqual([{ model: "prop_door_a", tuning: "base_door" }]);
  });

  it("writes Flags onto new tuning items that start as <Flags />", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CDoorTuningFile>
 <NamedTuningArray>
${newTuningItem("SlidingTest")}
 </NamedTuningArray>
 <ModelToTuneMapping>
 </ModelToTuneMapping>
</CDoorTuningFile>
`;
    expect(xml).toContain("<Flags />");
    const next = updateTuningValues(xml, "SlidingTest", {
      Flags: "DontCloseWhenTouched",
    });
    expect(next).toContain("<Flags>DontCloseWhenTouched</Flags>");
    expect(parseTuning(next).tunings[0]?.fields.Flags).toBe(
      "DontCloseWhenTouched",
    );
  });

  it("adds door mappings without blank gaps", () => {
    let xml = SAMPLE_TUNING;
    xml = setDoorMapping(xml, "test_door_latch", "LatchTest");
    xml = setDoorMapping(xml, "test_door_sliding", "SlidingTest");
    expect(xml).not.toMatch(/<\/Item>\s*\n\s*\n\s*<Item>/);
    expect(parseTuning(xml).maps.map((m) => m.model)).toEqual([
      "prop_door_a",
      "test_door_latch",
      "test_door_sliding",
    ]);
  });

  it("merges missing tunings/maps and reports conflicts", () => {
    const result = mergeTuningFiles(SAMPLE_TUNING, INCOMING_TUNING);
    expect(result.addTunings).toEqual(["new_door"]);
    expect(result.addMaps).toEqual([
      { model: "prop_door_b", tuning: "new_door" },
    ]);
    expect(result.conflicts).toEqual([
      {
        kind: "tuning",
        model: "shop_door",
        existing: "identical",
        incoming: "identical",
      },
      {
        kind: "map",
        model: "prop_door_a",
        existing: "base_door",
        incoming: "shop_door",
      },
    ]);
    const merged = parseTuning(result.xml);
    expect(merged.tunings.some((t) => t.name === "new_door")).toBe(true);
    expect(merged.maps.some((m) => m.model === "prop_door_b")).toBe(true);
    expect(merged.maps.find((m) => m.model === "prop_door_a")?.tuning).toBe(
      "base_door",
    );
    expect(result.xml).not.toMatch(/<\/Item>\s*\n\s*\n\s*<Item>/);
    expect(result.xml).not.toMatch(/<!--\s*(?:added|merged) by gta/i);
  });
});

describe("nametable", () => {
  it("round-trips names and auto-adds dasl_ links for d_ doors", () => {
    const names = ["d_one", "d_two"];
    const parsed = parseNametable(nametableBytes(names));
    expect(parsed).toContain("d_one");
    expect(parsed).toContain("d_two");
    expect(parsed).toContain(doorAudioLinkName("d_one"));
    expect(parsed).toContain(doorAudioLinkName("d_two"));
  });
});
