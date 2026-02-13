/**
 * TestDataLoader: Utility to load JSON test data files dynamically.
 */
import fs from 'fs/promises';
import path from 'path';

export default class TestDataLoader {
  static async load(fileName: string): Promise<any> {
    const filePath = path.join(__dirname, fileName);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  }
}
