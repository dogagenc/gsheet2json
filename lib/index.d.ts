interface GSheetOptions {
  credentialsPath: string;
  tokenPath?: string;
}

type SheetData = { [key: string]: string };

declare class RangeLine {
  getValue(key: string): string;
  setValue(key: string, value: any): void;
}

declare class Range {
  getLines(): RangeLine[];
  newLine(): RangeLine;
  save(): Promise<void>;
}

declare class GSheet {
  constructor(options: GSheetOptions);

  authenticate(): Promise<void>;

  getData(sheetId: string, ranges: [string]): Promise<SheetData[]>;
  getData<
    _,
    RangeName extends string,
    MappedData = { [key in RangeName]: SheetData[] }
  >(sheetId: string, ranges: RangeName[]): Promise<MappedData>;

  getRanges(sheetId: string, ranges: [string]): Promise<Range>;
  getRanges<
    _,
    RangeName extends string,
    MappedRange = { [key in RangeName]: Range[] }
  >(sheetId: string, ranges: RangeName[]): Promise<MappedRange>;
}

export default GSheet;
