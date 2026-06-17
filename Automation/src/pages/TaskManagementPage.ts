import { Page, Locator } from '@playwright/test';

export class TaskManagementPage {
  constructor(private readonly page: Page) {}

  // Navigation
  readonly navigationLinksLocator: Locator = this.page.getByRole('link');

  // Header / Top Bar
  readonly headerHeadingsLocator: Locator = this.page.getByRole('heading');

  // Sidebar
  readonly sidebarNavigationLocator: Locator = this.page.getByRole('navigation');

  // Main Content
  readonly mainRegionLocator: Locator = this.page.getByRole('main');
  readonly taskCreationFormHeadingLocator: Locator = this.page.getByRole('heading', { name: 'Task Creation Form' });
  readonly workflowStateColumnHeadingLocator: Locator = this.page.getByRole('columnheader', { name: 'Workflow State' });
  readonly taskListTableLocator: Locator = this.page.getByRole('table', { name: 'Task List' });
  readonly taskRowsLocator: Locator = this.page.getByRole('row');

  // Forms
  readonly taskTitleInputLocator: Locator = this.page.getByLabel('Task Title');
  readonly workflowStateDropdownLocator: Locator = this.page.getByRole('combobox', { name: 'Workflow State' });
  readonly workflowStateOptionsLocator: Locator = this.page.getByRole('option');
  readonly createTaskButtonLocator: Locator = this.page.getByRole('button', { name: 'Create Task' });

  // Status / Alerts
  readonly successAlertLocator: Locator = this.page.getByRole('status');

  // Footer
  readonly footerLocator: Locator = this.page.getByRole('contentinfo');
}