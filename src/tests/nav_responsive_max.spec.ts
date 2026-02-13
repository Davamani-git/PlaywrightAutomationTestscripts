import { test, expect } from '@playwright/test';
import { HomeActions } from '../actions/HomeActions';
import TestDataLoader from '../test-data/TestDataLoader';

test.describe('Navigation Bar Responsive Maximum Width', () => {
  test('Given maximum supported screen size, When user resizes, Then navigation bar should be visible or adapt responsively', async ({ page }) => {
    const navData = await TestDataLoader.load('nav.data.json');
    const actions = new HomeActions(page);

    // Given
    await actions.resizeWindow(navData.maxWidth, navData.height);

    // When
    const navVisible = await actions.checkNavigationBar();

    // Then
    expect(navVisible).toBeTruthy();
  });
});
