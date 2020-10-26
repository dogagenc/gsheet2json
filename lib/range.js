class Line {
  constructor(idx, values, keys, onValueChange) {
    this.lineIdx = idx;
    this.values = values;
    this.keys = keys;
    this.onValueChange = onValueChange;
  }

  getKeyIdx(key) {
    return this.keys.indexOf(key);
  }

  getValue(key) {
    return this.values[this.getKeyIdx(key)];
  }

  setValue(key, value) {
    const keyIdx = this.getKeyIdx(key);

    this.values = this.onValueChange(this.lineIdx, keyIdx, value);
  }
}

module.exports = class Range {
  constructor(sheetId, rangeName, data, sheetsApi) {
    this.sheetsApi = sheetsApi;
    this.sheetId = sheetId;
    this.rangeName = rangeName;
    this.values = data.values;
    this.dimension = data.majorDimension;
    this.keys = this.createKeys();
    this.lines = this.createLines();
  }

  createKeys() {
    const keys = this.values[0];

    if (!keys || !keys.length) {
      throw new Error('There is no property row found in 1st line!');
    }

    return keys;
  }

  createLines() {
    return this.values
      .filter((_, idx) => {
        return idx > 0;
      })
      .map((lineValues, lineIdx) => {
        return new Line(
          lineIdx + 1,
          lineValues,
          this.keys,
          this.onValueChange.bind(this)
        );
      });
  }

  getLines() {
    return this.lines;
  }

  newLine() {
    const line = new Line(
      this.lines.length + 1,
      [],
      this.keys,
      this.onValueChange.bind(this)
    );

    this.lines.push(line);
    this.values.push([]);

    return line;
  }

  onValueChange(lineIdx, keyIdx, value) {
    this.values[lineIdx][keyIdx] = value;

    return this.values[lineIdx];
  }

  async save() {
    await this.sheetsApi.spreadsheets.values.update({
      spreadsheetId: this.sheetId, // TODO: Update placeholder value.
      range: this.rangeName,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: this.values,
        majorDimension: this.dimension,
      },
    });

    console.log('Spreadsheet saved succesfully!');
  }
};
