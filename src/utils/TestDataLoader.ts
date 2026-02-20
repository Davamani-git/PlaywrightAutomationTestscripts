/**
 * Utility to load test data JSON files.
 * Usage: const data = await TestDataLoader.load('cart.data.json');
 */
import { promises as fs } from 'fs';
import * as path from 'path';

export class TestDataLoader {
  /**
   * Loads test data from JSON file under src/test-data.
   * @param fileName File name (e.g., 'cart.data.json')
   * @returns Parsed JSON object
   */
  static async load(fileName: string): Promise<any> {
    const filePath = path.resolve(__dirname, '../test-data', fileName);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }
}
