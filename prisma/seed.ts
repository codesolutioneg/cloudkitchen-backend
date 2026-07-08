import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = 'admin@cloudkitchen.example';
const SUPER_ADMIN_PASSWORD = 'Admin@12345';
const VITEST_DASHBOARD_EMAIL = 'vitest-dashboard@example.com';

const ROLE_NAMES = [
  'Super Admin',
  'Sales',
  'Operations',
  'Kitchen Manager',
  'Delivery',
  'Support',
  'Finance',
  'Marketing',
  'Engineering',
] as const;

const PERMISSION_GROUPS: Array<{ name: string; permissions: Array<{ code: string; name: string }> }> =
  [
    {
      name: 'Orders',
      permissions: [
        { code: 'orders:read', name: 'Read orders' },
        { code: 'orders:write', name: 'Write orders' },
        { code: 'orders:approve', name: 'Approve orders' },
      ],
    },
    {
      name: 'Products',
      permissions: [
        { code: 'products:read', name: 'Read products' },
        { code: 'products:write', name: 'Write products' },
      ],
    },
    {
      name: 'Companies',
      permissions: [
        { code: 'companies:read', name: 'Read companies' },
        { code: 'companies:approve', name: 'Approve companies' },
      ],
    },
    {
      name: 'Dashboard Users',
      permissions: [
        { code: 'dashboard_users:read', name: 'Read dashboard users' },
        { code: 'dashboard_users:write', name: 'Manage dashboard users' },
      ],
    },
    {
      name: 'Features',
      permissions: [
        { code: 'features:read', name: 'Read features' },
        { code: 'features:write', name: 'Manage features' },
      ],
    },
  ];

const MODULES: Array<{ code: string; name: string; audience: 'company' | 'dashboard' }> = [
  { code: 'orders', name: 'Orders', audience: 'company' },
  { code: 'products', name: 'Products', audience: 'company' },
  { code: 'categories', name: 'Categories', audience: 'company' },
  { code: 'reports', name: 'Reports', audience: 'dashboard' },
  { code: 'notifications', name: 'Notifications', audience: 'company' },
  { code: 'tracking', name: 'Tracking', audience: 'company' },
  { code: 'analytics', name: 'Analytics', audience: 'dashboard' },
  { code: 'bulk_orders', name: 'Bulk Orders', audience: 'company' },
  { code: 'export_excel', name: 'Export Excel', audience: 'dashboard' },
  { code: 'import_excel', name: 'Import Excel', audience: 'dashboard' },
];

const DASHBOARD_PAGES: Array<{ name: string; route: string; sortOrder: number }> = [
  { name: 'Companies', route: '/dashboard/companies', sortOrder: 10 },
  { name: 'Roles', route: '/dashboard/roles', sortOrder: 20 },
  { name: 'Users', route: '/dashboard/users', sortOrder: 30 },
  { name: 'Features', route: '/dashboard/features', sortOrder: 40 },
  { name: 'Catalog', route: '/dashboard/catalog', sortOrder: 50 },
  { name: 'Menus', route: '/dashboard/menus', sortOrder: 60 },
  { name: 'Rules', route: '/dashboard/rules', sortOrder: 70 },
  { name: 'Workflows', route: '/dashboard/workflows', sortOrder: 80 },
  { name: 'Orders', route: '/dashboard/orders', sortOrder: 85 },
  { name: 'Kitchen', route: '/dashboard/kitchen', sortOrder: 84 },
  { name: 'Operations Desk', route: '/dashboard/operations', sortOrder: 86 },
  { name: 'Delivery', route: '/dashboard/delivery', sortOrder: 87 },
  { name: 'Approval Workflows', route: '/dashboard/approval-workflows', sortOrder: 90 },
  { name: 'Audit Logs', route: '/dashboard/audit-logs', sortOrder: 95 },
  { name: 'Notifications', route: '/dashboard/notifications', sortOrder: 96 },
  { name: 'Jobs', route: '/dashboard/jobs', sortOrder: 97 },
  { name: 'Integrations', route: '/dashboard/integrations', sortOrder: 98 },
  { name: 'Localization', route: '/dashboard/localization', sortOrder: 99 },
];

async function seedLanguages() {
  await prisma.language.upsert({
    where: { code: 'en' },
    update: {},
    create: {
      code: 'en',
      name: 'English',
      native_name: 'English',
      is_default: true,
      is_rtl: false,
      is_active: true,
    },
  });

  await prisma.language.upsert({
    where: { code: 'ar' },
    update: {},
    create: {
      code: 'ar',
      name: 'Arabic',
      native_name: 'العربية',
      is_default: false,
      is_rtl: true,
      is_active: true,
    },
  });
}

async function seedRoles() {
  const roles: Record<string, string> = {};
  for (const name of ROLE_NAMES) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { is_system_role: true, is_deleted: false },
      create: {
        name,
        scope: 'platform',
        is_system_role: true,
        description: `${name} system role`,
      },
    });
    roles[name] = role.id;
  }
  return roles;
}

async function seedPermissions() {
  const permissions: Record<string, string> = {};
  for (let i = 0; i < PERMISSION_GROUPS.length; i++) {
    const group = PERMISSION_GROUPS[i]!;
    let pg = await prisma.permissionGroup.findFirst({ where: { name: group.name } });
    if (!pg) {
      pg = await prisma.permissionGroup.create({
        data: { name: group.name, sort_order: i },
      });
    }

    for (const perm of group.permissions) {
      const row = await prisma.permission.upsert({
        where: { code: perm.code },
        update: { name: perm.name, permission_group_id: pg.id },
        create: {
          code: perm.code,
          name: perm.name,
          permission_group_id: pg.id,
        },
      });
      permissions[perm.code] = row.id;
    }
  }
  return permissions;
}

async function seedModulesAndFeatures() {
  const modules: Record<string, string> = {};
  for (let i = 0; i < MODULES.length; i++) {
    const m = MODULES[i]!;
    const row = await prisma.module.upsert({
      where: { code: m.code },
      update: { name: m.name, audience: m.audience, sort_order: i },
      create: {
        code: m.code,
        name: m.name,
        audience: m.audience,
        is_core: m.code === 'orders' || m.code === 'products',
        sort_order: i,
      },
    });
    modules[m.code] = row.id;

    const featureCode = `${m.code}_enabled`;
    await prisma.feature.upsert({
      where: { code: featureCode },
      update: { module_id: row.id, is_global_default_enabled: true },
      create: {
        code: featureCode,
        name: `${m.name} Enabled`,
        module_id: row.id,
        is_global_default_enabled: true,
      },
    });
  }
  return modules;
}

async function seedDashboardPages(superAdminRoleId: string) {
  const pages: Record<string, string> = {};

  for (const p of DASHBOARD_PAGES) {
    let page = await prisma.dashboardPage.findFirst({ where: { route: p.route } });
    if (!page) {
      page = await prisma.dashboardPage.create({
        data: {
          name: p.name,
          route: p.route,
          sort_order: p.sortOrder,
          is_enabled: true,
          is_visible: true,
        },
      });
    } else {
      page = await prisma.dashboardPage.update({
        where: { id: page.id },
        data: { name: p.name, sort_order: p.sortOrder, is_enabled: true, is_visible: true },
      });
    }
    pages[p.route] = page.id;

    await prisma.rolePagePermission.upsert({
      where: { role_id_page_id: { role_id: superAdminRoleId, page_id: page.id } },
      update: {
        can_view: true,
        can_create: true,
        can_edit: true,
        can_delete: true,
        can_approve: true,
        can_reject: true,
        can_export: true,
        can_import: true,
      },
      create: {
        role_id: superAdminRoleId,
        page_id: page.id,
        can_view: true,
        can_create: true,
        can_edit: true,
        can_delete: true,
        can_approve: true,
        can_reject: true,
        can_export: true,
        can_import: true,
      },
    });
  }

  return pages;
}

async function seedDashboardUsers(superAdminRoleId: string) {
  const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);

  const superAdmin = await prisma.dashboardUser.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: { password_hash: passwordHash, status: 'active', is_deleted: false },
    create: {
      full_name: 'Super Admin',
      email: SUPER_ADMIN_EMAIL,
      password_hash: passwordHash,
      status: 'active',
      department: 'Platform',
    },
  });

  await prisma.dashboardUserRole.upsert({
    where: {
      dashboard_user_id_role_id: {
        dashboard_user_id: superAdmin.id,
        role_id: superAdminRoleId,
      },
    },
    update: {},
    create: {
      dashboard_user_id: superAdmin.id,
      role_id: superAdminRoleId,
    },
  });

  await prisma.dashboardUserCompanyScope.upsert({
    where: { dashboard_user_id: superAdmin.id },
    update: { scope_type: 'all' },
    create: {
      dashboard_user_id: superAdmin.id,
      scope_type: 'all',
    },
  });

  const vitestHash = await bcrypt.hash('TestPass123!', 10);
  const vitestUser = await prisma.dashboardUser.upsert({
    where: { email: VITEST_DASHBOARD_EMAIL },
    update: { password_hash: vitestHash, status: 'active', is_deleted: false },
    create: {
      full_name: 'Vitest Dashboard Reviewer',
      email: VITEST_DASHBOARD_EMAIL,
      password_hash: vitestHash,
      status: 'active',
    },
  });

  await prisma.dashboardUserRole.upsert({
    where: {
      dashboard_user_id_role_id: {
        dashboard_user_id: vitestUser.id,
        role_id: superAdminRoleId,
      },
    },
    update: {},
    create: {
      dashboard_user_id: vitestUser.id,
      role_id: superAdminRoleId,
    },
  });

  await prisma.dashboardUserCompanyScope.upsert({
    where: { dashboard_user_id: vitestUser.id },
    update: { scope_type: 'all' },
    create: {
      dashboard_user_id: vitestUser.id,
      scope_type: 'all',
    },
  });
}

async function seedDefaultPricingList() {
  await prisma.productPricingList.upsert({
    where: { id: '00000000-0000-4000-8000-000000000099' },
    update: { is_default: true, name: 'Default SAR', currency: 'SAR' },
    create: {
      id: '00000000-0000-4000-8000-000000000099',
      name: 'Default SAR',
      currency: 'SAR',
      is_default: true,
    },
  });
}

const RULE_TYPES: Array<{ code: string; name: string; valueSchema?: Record<string, unknown> }> = [
  { code: 'min_order_qty', name: 'Minimum Order Quantity', valueSchema: { type: 'number' } },
  { code: 'max_order_qty', name: 'Maximum Order Quantity', valueSchema: { type: 'number' } },
  { code: 'min_notice_hours', name: 'Minimum Notice Hours', valueSchema: { type: 'number' } },
  {
    code: 'allowed_delivery_days',
    name: 'Allowed Delivery Days',
    valueSchema: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
  },
  { code: 'cutoff_time', name: 'Order Cutoff Time', valueSchema: { type: 'string', format: 'time' } },
  { code: 'blackout_dates', name: 'Blackout Dates', valueSchema: { type: 'array', items: { type: 'string' } } },
  { code: 'vat_rate', name: 'VAT Rate', valueSchema: { type: 'number' } },
  { code: 'service_charge', name: 'Service Charge', valueSchema: { type: 'number' } },
  { code: 'delivery_fee', name: 'Delivery Fee', valueSchema: { type: 'number' } },
];

async function seedRuleTypes() {
  for (const rt of RULE_TYPES) {
    await prisma.ruleType.upsert({
      where: { code: rt.code },
      update: { name: rt.name, value_schema: rt.valueSchema ?? undefined },
      create: {
        code: rt.code,
        name: rt.name,
        value_schema: rt.valueSchema ?? undefined,
      },
    });
  }
}

const GLOBAL_SETTINGS: Array<{
  key: string;
  value: unknown;
  isOverridable: boolean;
  description: string;
}> = [
  {
    key: 'theme.primary_color',
    value: '#2563eb',
    isOverridable: true,
    description: 'Primary brand color for company portal theming',
  },
  {
    key: 'ordering.default_vat_rate',
    value: 0.15,
    isOverridable: true,
    description: 'Default VAT rate applied to orders when no rule override exists',
  },
  {
    key: 'notification.order_confirmation.channel',
    value: 'email',
    isOverridable: false,
    description: 'Channel for order confirmation notifications (platform-wide)',
  },
];

async function seedGlobalSettings() {
  for (const setting of GLOBAL_SETTINGS) {
    await prisma.globalSetting.upsert({
      where: { setting_key: setting.key },
      update: {
        setting_value: setting.value,
        is_overridable: setting.isOverridable,
        description: setting.description,
      },
      create: {
        setting_key: setting.key,
        setting_value: setting.value,
        is_overridable: setting.isOverridable,
        description: setting.description,
      },
    });
  }
}

const ORDER_WORKFLOW_ID = '00000000-0000-4000-8000-000000000001';

const ORDER_WORKFLOW_STEPS: Array<{
  id: string;
  code: string;
  name: string;
  stepType: 'initial' | 'intermediate' | 'final';
  sortOrder: number;
  slaMinutes?: number;
}> = [
  { id: '00000000-0000-4000-8000-000000000011', code: 'submitted', name: 'Submitted', stepType: 'initial', sortOrder: 10 },
  { id: '00000000-0000-4000-8000-000000000012', code: 'pending_approval', name: 'Pending Approval', stepType: 'intermediate', sortOrder: 20, slaMinutes: 60 },
  { id: '00000000-0000-4000-8000-000000000013', code: 'kitchen_accepted', name: 'Kitchen Accepted', stepType: 'intermediate', sortOrder: 30 },
  { id: '00000000-0000-4000-8000-000000000014', code: 'preparing', name: 'Preparing', stepType: 'intermediate', sortOrder: 40, slaMinutes: 45 },
  { id: '00000000-0000-4000-8000-000000000015', code: 'ready', name: 'Ready', stepType: 'intermediate', sortOrder: 50 },
  { id: '00000000-0000-4000-8000-000000000019', code: 'out_for_delivery', name: 'Out for Delivery', stepType: 'intermediate', sortOrder: 55 },
  { id: '00000000-0000-4000-8000-00000000001a', code: 'awaiting_pickup', name: 'Awaiting Pickup', stepType: 'intermediate', sortOrder: 56 },
  { id: '00000000-0000-4000-8000-000000000016', code: 'delivered', name: 'Delivered', stepType: 'final', sortOrder: 60 },
  { id: '00000000-0000-4000-8000-000000000020', code: 'picked_up', name: 'Picked Up', stepType: 'final', sortOrder: 61 },
  { id: '00000000-0000-4000-8000-000000000017', code: 'cancelled', name: 'Cancelled', stepType: 'final', sortOrder: 70 },
  { id: '00000000-0000-4000-8000-000000000018', code: 'refunded', name: 'Refunded', stepType: 'final', sortOrder: 80 },
];

async function seedDefaultOrderWorkflow() {
  await prisma.workflow.upsert({
    where: { id: ORDER_WORKFLOW_ID },
    update: { name: 'Default Order Workflow', workflow_type: 'order', is_active: true },
    create: {
      id: ORDER_WORKFLOW_ID,
      name: 'Default Order Workflow',
      workflow_type: 'order',
      company_id: null,
      is_active: true,
    },
  });

  for (const step of ORDER_WORKFLOW_STEPS) {
    await prisma.workflowStep.upsert({
      where: { workflow_id_code: { workflow_id: ORDER_WORKFLOW_ID, code: step.code } },
      update: {
        name: step.name,
        step_type: step.stepType,
        sort_order: step.sortOrder,
        sla_minutes: step.slaMinutes ?? null,
      },
      create: {
        id: step.id,
        workflow_id: ORDER_WORKFLOW_ID,
        code: step.code,
        name: step.name,
        step_type: step.stepType,
        sort_order: step.sortOrder,
        sla_minutes: step.slaMinutes ?? null,
      },
    });
  }

  const stepIds = Object.fromEntries(ORDER_WORKFLOW_STEPS.map((s) => [s.code, s.id]));

  const transitions: Array<{
    from: string | null;
    to: string;
    trigger: 'manual' | 'automatic' | 'scheduled';
  }> = [
    { from: 'submitted', to: 'pending_approval', trigger: 'automatic' },
    { from: 'submitted', to: 'pending_approval', trigger: 'manual' },
    { from: 'pending_approval', to: 'kitchen_accepted', trigger: 'manual' },
    { from: 'kitchen_accepted', to: 'preparing', trigger: 'manual' },
    { from: 'preparing', to: 'ready', trigger: 'manual' },
    { from: 'ready', to: 'out_for_delivery', trigger: 'manual' },
    { from: 'ready', to: 'awaiting_pickup', trigger: 'manual' },
    { from: 'out_for_delivery', to: 'delivered', trigger: 'manual' },
    { from: 'awaiting_pickup', to: 'picked_up', trigger: 'manual' },
    { from: 'ready', to: 'delivered', trigger: 'manual' },
    { from: 'submitted', to: 'cancelled', trigger: 'manual' },
    { from: 'pending_approval', to: 'cancelled', trigger: 'manual' },
    { from: 'kitchen_accepted', to: 'cancelled', trigger: 'manual' },
    { from: 'preparing', to: 'cancelled', trigger: 'manual' },
    { from: 'ready', to: 'cancelled', trigger: 'manual' },
    { from: 'delivered', to: 'refunded', trigger: 'manual' },
  ];

  for (const t of transitions) {
    const fromStepId = t.from ? stepIds[t.from]! : null;
    const toStepId = stepIds[t.to]!;

    const existing = await prisma.workflowTransition.findFirst({
      where: {
        workflow_id: ORDER_WORKFLOW_ID,
        from_step_id: fromStepId,
        to_step_id: toStepId,
        trigger_type: t.trigger,
      },
    });

    if (!existing) {
      await prisma.workflowTransition.create({
        data: {
          workflow_id: ORDER_WORKFLOW_ID,
          from_step_id: fromStepId,
          to_step_id: toStepId,
          trigger_type: t.trigger,
        },
      });
    }
  }
}

const SEED_CATEGORY_ID = '00000000-0000-4000-8000-000000000101';
const SEED_PRODUCT_ID = '00000000-0000-4000-8000-000000000102';
const SEED_MENU_ID = '00000000-0000-4000-8000-000000000103';
const SEED_MENU_SECTION_ID = '00000000-0000-4000-8000-000000000104';
const SEED_ORDER_APPROVAL_WORKFLOW_ID = '00000000-0000-4000-8000-000000000201';

async function seedOrderCatalogData() {
  await prisma.category.upsert({
    where: { id: SEED_CATEGORY_ID },
    update: { name: 'Meals', slug: 'meals', is_deleted: false },
    create: {
      id: SEED_CATEGORY_ID,
      name: 'Meals',
      slug: 'meals',
      sort_order: 1,
    },
  });

  await prisma.product.upsert({
    where: { id: SEED_PRODUCT_ID },
    update: {
      name: 'Chicken Meal',
      base_price: 45,
      currency: 'SAR',
      is_active: true,
      is_deleted: false,
    },
    create: {
      id: SEED_PRODUCT_ID,
      category_id: SEED_CATEGORY_ID,
      name: 'Chicken Meal',
      base_price: 45,
      currency: 'SAR',
      is_active: true,
    },
  });

  await prisma.productPrice.upsert({
    where: { id: '00000000-0000-4000-8000-000000000105' },
    update: { price: 45 },
    create: {
      id: '00000000-0000-4000-8000-000000000105',
      pricing_list_id: '00000000-0000-4000-8000-000000000099',
      product_id: SEED_PRODUCT_ID,
      price: 45,
      effective_from: new Date('2020-01-01'),
    },
  });

  await prisma.catalogMenu.upsert({
    where: { id: SEED_MENU_ID },
    update: { name: 'Platform Default Menu', is_active: true },
    create: {
      id: SEED_MENU_ID,
      name: 'Platform Default Menu',
      menu_type: 'general',
      description: 'Seeded menu for order integration tests',
      is_active: true,
    },
  });

  await prisma.catalogMenuSection.upsert({
    where: { id: SEED_MENU_SECTION_ID },
    update: { name: 'Main', sort_order: 1 },
    create: {
      id: SEED_MENU_SECTION_ID,
      catalog_menu_id: SEED_MENU_ID,
      name: 'Main',
      sort_order: 1,
    },
  });

  await prisma.catalogMenuProduct.upsert({
    where: {
      catalog_menu_section_id_product_id: {
        catalog_menu_section_id: SEED_MENU_SECTION_ID,
        product_id: SEED_PRODUCT_ID,
      },
    },
    update: { sort_order: 1, is_featured: true },
    create: {
      catalog_menu_section_id: SEED_MENU_SECTION_ID,
      product_id: SEED_PRODUCT_ID,
      sort_order: 1,
      is_featured: true,
    },
  });
}

async function seedPlatformMinOrderQtyRule() {
  const ruleType = await prisma.ruleType.findUnique({ where: { code: 'min_order_qty' } });
  if (!ruleType) {
    return;
  }

  const existing = await prisma.businessRule.findFirst({
    where: {
      rule_type_id: ruleType.id,
      scope_type: 'platform',
      scope_id: null,
    },
  });

  if (!existing) {
    await prisma.businessRule.create({
      data: {
        rule_type_id: ruleType.id,
        scope_type: 'platform',
        value: { minQty: 1 },
        priority: 0,
      },
    });
  }
}

async function seedDefaultOrderApprovalWorkflow(superAdminRoleId: string) {
  await prisma.approvalWorkflow.upsert({
    where: { id: SEED_ORDER_APPROVAL_WORKFLOW_ID },
    update: { name: 'Default Order Approval', entity_type: 'order', is_active: true },
    create: {
      id: SEED_ORDER_APPROVAL_WORKFLOW_ID,
      name: 'Default Order Approval',
      entity_type: 'order',
      company_id: null,
      is_active: true,
    },
  });

  const existingStep = await prisma.approvalWorkflowStep.findFirst({
    where: { approval_workflow_id: SEED_ORDER_APPROVAL_WORKFLOW_ID, step_order: 1 },
  });

  if (!existingStep) {
    await prisma.approvalWorkflowStep.create({
      data: {
        approval_workflow_id: SEED_ORDER_APPROVAL_WORKFLOW_ID,
        step_order: 1,
        name: 'Super Admin Approval',
        approver_type: 'role',
        approver_role_id: superAdminRoleId,
        required_approval_count: 1,
        is_required: true,
      },
    });
  } else {
    await prisma.approvalWorkflowStep.update({
      where: { id: existingStep.id },
      data: {
        approver_type: 'role',
        approver_role_id: superAdminRoleId,
        required_approval_count: 1,
      },
    });
  }
}

async function seedNotificationTemplates() {
  const templates: Array<{
    code: string;
    channel: string;
    languageCode: string;
    subjectTemplate?: string;
    bodyTemplate: string;
  }> = [
    {
      code: 'order_confirmation',
      channel: 'push',
      languageCode: 'en',
      subjectTemplate: 'Order Confirmed',
      bodyTemplate: 'Your order {{orderNumber}} has been confirmed.',
    },
    {
      code: 'order_confirmation',
      channel: 'in_app',
      languageCode: 'en',
      subjectTemplate: 'Order Confirmed',
      bodyTemplate: 'Your order {{orderNumber}} has been confirmed.',
    },
    {
      code: 'order_confirmation',
      channel: 'push',
      languageCode: 'ar',
      subjectTemplate: 'تم تأكيد الطلب',
      bodyTemplate: 'تم تأكيد طلبك {{orderNumber}}.',
    },
    {
      code: 'order_confirmation',
      channel: 'in_app',
      languageCode: 'ar',
      subjectTemplate: 'تم تأكيد الطلب',
      bodyTemplate: 'تم تأكيد طلبك {{orderNumber}}.',
    },
  ];

  for (const t of templates) {
    await prisma.notificationTemplate.upsert({
      where: {
        code_channel_language_code: {
          code: t.code,
          channel: t.channel,
          language_code: t.languageCode,
        },
      },
      update: {
        subject_template: t.subjectTemplate ?? null,
        body_template: t.bodyTemplate,
      },
      create: {
        code: t.code,
        channel: t.channel,
        language_code: t.languageCode,
        subject_template: t.subjectTemplate ?? null,
        body_template: t.bodyTemplate,
      },
    });
  }
}

async function seedFulfillmentRolePermissions(roles: Record<string, string>, pages: Record<string, string>) {
  async function grant(
    roleName: string,
    pageRoute: string,
    perms: {
      view?: boolean;
      create?: boolean;
      edit?: boolean;
      delete?: boolean;
      approve?: boolean;
    },
  ) {
    const roleId = roles[roleName];
    const pageId = pages[pageRoute];
    if (!roleId || !pageId) return;

    await prisma.rolePagePermission.upsert({
      where: { role_id_page_id: { role_id: roleId, page_id: pageId } },
      update: {
        can_view: perms.view ?? false,
        can_create: perms.create ?? false,
        can_edit: perms.edit ?? false,
        can_delete: perms.delete ?? false,
        can_approve: perms.approve ?? false,
      },
      create: {
        role_id: roleId,
        page_id: pageId,
        can_view: perms.view ?? false,
        can_create: perms.create ?? false,
        can_edit: perms.edit ?? false,
        can_delete: perms.delete ?? false,
        can_approve: perms.approve ?? false,
      },
    });
  }

  const kitchenOpsOrders = { view: true, edit: true, create: true };

  await grant('Kitchen Manager', '/dashboard/kitchen', { view: true, edit: true, create: true });
  await grant('Kitchen Manager', '/dashboard/orders', kitchenOpsOrders);
  await grant('Operations', '/dashboard/operations', { view: true, edit: true, create: true });
  await grant('Operations', '/dashboard/orders', kitchenOpsOrders);
  await grant('Delivery', '/dashboard/delivery', { view: true, edit: true });
}

async function seedDeliveryDashboardUser(roles: Record<string, string>) {
  const deliveryRoleId = roles['Delivery'];
  if (!deliveryRoleId) return;

  const passwordHash = await bcrypt.hash('Delivery@12345', 10);
  const user = await prisma.dashboardUser.upsert({
    where: { email: 'delivery@cloudkitchen.example' },
    update: { password_hash: passwordHash, status: 'active', is_deleted: false },
    create: {
      full_name: 'Fleet Delivery Driver',
      email: 'delivery@cloudkitchen.example',
      password_hash: passwordHash,
      status: 'active',
      department: 'Logistics',
    },
  });

  await prisma.dashboardUserRole.upsert({
    where: {
      dashboard_user_id_role_id: {
        dashboard_user_id: user.id,
        role_id: deliveryRoleId,
      },
    },
    update: {},
    create: {
      dashboard_user_id: user.id,
      role_id: deliveryRoleId,
    },
  });

  await prisma.dashboardUserCompanyScope.upsert({
    where: { dashboard_user_id: user.id },
    update: { scope_type: 'all' },
    create: {
      dashboard_user_id: user.id,
      scope_type: 'all',
    },
  });
}

async function seedDefaultExternalSystem() {
  await prisma.externalSystem.upsert({
    where: { code: 'odoo' },
    update: { name: 'Odoo ERP', system_type: 'erp', is_active: false },
    create: {
      code: 'odoo',
      name: 'Odoo ERP',
      system_type: 'erp',
      is_active: false,
    },
  });
}

async function main() {
  await seedLanguages();
  const roles = await seedRoles();
  await seedPermissions();
  await seedModulesAndFeatures();
  const superAdminRoleId = roles['Super Admin']!;
  const pages = await seedDashboardPages(superAdminRoleId);
  await seedFulfillmentRolePermissions(roles, pages);
  await seedDashboardUsers(superAdminRoleId);
  await seedDeliveryDashboardUser(roles);
  await seedDefaultPricingList();
  await seedRuleTypes();
  await seedGlobalSettings();
  await seedDefaultOrderWorkflow();
  await seedOrderCatalogData();
  await seedPlatformMinOrderQtyRule();
  await seedDefaultOrderApprovalWorkflow(superAdminRoleId);
  await seedNotificationTemplates();
  await seedDefaultExternalSystem();

  console.log(
    'Seed complete: languages, roles, permissions, modules, pages, dashboard users, rule types, settings, workflows, orders catalog, approval workflows, notifications, integrations',
  );
  console.log(`Super Admin: ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
