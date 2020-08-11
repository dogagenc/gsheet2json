const fs = require('fs');
const util = require('util');
const path = require('path');
const { google } = require('googleapis');
const readline = require('readline');
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const Range = require('./range');

module.exports = class Sheet {
  constructor(_options = {}) {
    this.hasCredentials = false;
    const defaultOptions = {
      tokenPath: 'token.json',
    };

    this.options = {
      ...defaultOptions,
      ..._options,
    };

    if (_options.credentialsPath) {
      this.hasCredentials = true;
    }

    this.auth = null;
    this.sheetsApi = null;
  }

  async getCredentials() {
    const credentialsFile = await readFile(this.options.credentialsPath);

    return JSON.parse(credentialsFile)['installed'];
  }

  async getToken() {
    try {
      const token = await readFile(this.options.tokenPath);

      return JSON.parse(token);
    } catch (error) {
      console.log(
        `Token is not found on path ${this.options.tokenPath}. Creating new token...`
      );
      return this.getNewToken();
    }
  }

  async getNewToken() {
    const authUrl = this.auth.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    console.log('Authorize this app by visiting this url:', authUrl);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve, reject) => {
      rl.question('Enter the code from that page here: ', (code) => {
        rl.close();

        this.auth.getToken(code, async (err, token) => {
          if (err) {
            reject('Error while trying to retrieve access token');
          }

          try {
            const { tokenPath } = this.options;
            await writeFile(tokenPath, JSON.stringify(token));
            console.log('Token stored to', tokenPath);
          } catch (error) {
            console.error(error);
          }

          resolve(token);
        });
      });
    });
  }

  async authenticate(clientID, clientSecret) {
    if (!clientSecret && !clientID && !this.hasCredentials) {
      throw new Error(
        'You must either pass client secret & id as arguments or specify a credentialsPath!'
      );
    }

    if (this.hasCredentials) {
      const {
        client_secret,
        client_id,
        redirect_uris,
      } = await this.getCredentials();
      this.auth = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );
    } else {
      this.auth = new google.auth.OAuth2(clientID, clientSecret);
    }

    const token = await this.getToken();
    this.auth.setCredentials(token);
  }

  setApi() {
    this.sheetsApi =
      this.sheetsApi || google.sheets({ version: 'v4', auth: this.auth });
  }

  async getRangesRaw(sheetId, ranges) {
    if (!ranges.length) {
      throw new Error('You must specify ranges to get data!');
    }

    return this.sheetsApi.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges,
    });
  }

  async getData(sheetId, ranges = [], isRange = false) {
    this.setApi();

    console.log('Fetching spreadsheet data...');
    const res = await this.getRangesRaw(sheetId, ranges);

    return this.formatData(res.data.valueRanges, ranges);
  }

  async getRanges(sheetId, ranges) {
    this.setApi();
    console.log('Fetching ranges...');

    const res = await this.getRangesRaw(sheetId, ranges);

    return this.prepareRanges(sheetId, ranges, res.data.valueRanges);
  }

  prepareRanges(sheetId, ranges, data) {
    let rangeObj;

    if (ranges.length === 1) {
      rangeObj = this.prepareRange(sheetId, ranges[0], data[0]);
    } else {
      rangeObj = ranges.reduce((obj, range, rangeIdx) => {
        obj[range] = this.prepareRange(sheetId, range, data[rangeIdx]);

        return obj;
      }, {});
    }

    return rangeObj;
  }

  prepareRange(sheetId, rangeName, data) {
    const range = new Range(sheetId, rangeName, data, this.sheetsApi);

    return range;
  }

  formatData(data, ranges) {
    let formatted;

    if (ranges.length === 1) {
      formatted = this.linesToJSON(data[0], ranges[0]);
    } else {
      formatted = ranges.reduce((obj, range, rangeIdx) => {
        obj[range] = this.linesToJSON(data[rangeIdx], range);

        return obj;
      }, {});
    }

    return formatted;
  }

  async saveSheet(sheetId, ranges, outputPath = 'data.json') {
    const data = await this.getData(sheetId, ranges);

    await this.saveData(data, outputPath);
  }

  linesToJSON(lines, rangeName) {
    const keys = [];
    const arr = [];

    lines.values.forEach((line, lineIdx) => {
      if (!line || !line.length) {
        return;
      }

      if (lineIdx === 0) {
        line.forEach((value) => keys.push(value));

        return;
      }

      const obj = {};

      line.forEach((value, valueIdx) => {
        const prop = keys[valueIdx] || null;

        if (prop === null) return;

        obj[prop] = value;
      });

      arr.push(obj);
    });

    return arr;
  }

  async saveData(data, _path) {
    const outputPath = path.resolve(_path);
    await writeFile(outputPath, JSON.stringify(data));
    console.log(`Data saved to ${outputPath}`);
  }
};
