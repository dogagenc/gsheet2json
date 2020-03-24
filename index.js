const fs = require('fs');
const util = require('util');
const path = require('path');
const { google } = require('googleapis');
const readline = require('readline');
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

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
      scope: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
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

  async getData(sheetId, ranges = []) {
    if (!ranges.length) {
      throw new Error('You must specify ranges to get data!');
    }
    console.log('Fetching spreadsheet data...');
    const sheets = google.sheets({ version: 'v4', auth: this.auth });
    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId,
      ranges,
    });

    return this.formatData(res.data.valueRanges, ranges);
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
        throw new Error(`Error on line ${lineIdx} and range ${rangeName}`);
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
