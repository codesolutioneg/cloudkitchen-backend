/**
 * OpenAPI entries for routes whose Zod schemas exist in module files but lack registerPath.
 * Imported from setup.ts so the registry is complete before Swagger is generated (Phase 14 / §21.6).
 */
import { registry } from './registry';

const dash = [{ dashboardBearerAuth: [] as string[] }];

function reg(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  tags: string[],
  summary: string,
) {
  registry.registerPath({
    method,
    path,
    tags,
    summary,
    security: dash,
    responses: {
      200: { description: summary },
      201: { description: summary },
      204: { description: summary },
    },
  });
}

// ── me (schemas registered via me.routes → me.schemas) ─────────────────────

// ── dashboard-users-rbac ───────────────────────────────────────────────────
reg('get', '/api/v1/dashboard/permissions', ['RBAC'], 'List permissions');

// ── business-rules ─────────────────────────────────────────────────────────
const br = ['Business Rules'];
reg('post', '/api/v1/dashboard/rules/rule-types', br, 'Create rule type');
reg('patch', '/api/v1/dashboard/rules/rule-types/{id}', br, 'Update rule type');
reg('get', '/api/v1/dashboard/rules/business-rules', br, 'List business rules');
reg('post', '/api/v1/dashboard/rules/business-rules', br, 'Create business rule');
reg('patch', '/api/v1/dashboard/rules/business-rules/{id}', br, 'Update business rule');
reg('delete', '/api/v1/dashboard/rules/business-rules/{id}', br, 'Delete business rule');
reg('post', '/api/v1/dashboard/rules/calendars', br, 'Create calendar');
reg('patch', '/api/v1/dashboard/rules/calendars/{id}', br, 'Update calendar');
reg('get', '/api/v1/dashboard/rules/calendars/{id}/events', br, 'List calendar events');
reg('post', '/api/v1/dashboard/rules/calendars/{id}/events', br, 'Create calendar event');
reg('patch', '/api/v1/dashboard/rules/calendars/{id}/events/{eventId}', br, 'Update calendar event');

// ── catalog ────────────────────────────────────────────────────────────────
const cat = ['Catalog'];
reg('patch', '/api/v1/dashboard/catalog/categories/{id}', cat, 'Update category');
reg('delete', '/api/v1/dashboard/catalog/categories/{id}', cat, 'Delete category');
reg('get', '/api/v1/dashboard/catalog/pricing-lists', cat, 'List pricing lists');
reg('get', '/api/v1/dashboard/catalog/products/{id}', cat, 'Get product');
reg('patch', '/api/v1/dashboard/catalog/products/{id}', cat, 'Update product');
reg('delete', '/api/v1/dashboard/catalog/products/{id}', cat, 'Delete product');
reg('post', '/api/v1/dashboard/catalog/products/{id}/variants', cat, 'Create variant');
reg('patch', '/api/v1/dashboard/catalog/products/{id}/variants/{variantId}', cat, 'Update variant');
reg('post', '/api/v1/dashboard/catalog/products/{id}/option-groups', cat, 'Create option group');
reg('patch', '/api/v1/dashboard/catalog/products/{id}/option-groups/{groupId}', cat, 'Update option group');
reg('post', '/api/v1/dashboard/catalog/products/{id}/availability', cat, 'Create availability');
reg('patch', '/api/v1/dashboard/catalog/products/{id}/availability/{availabilityId}', cat, 'Update availability');
reg('delete', '/api/v1/dashboard/catalog/products/{id}/availability/{availabilityId}', cat, 'Delete availability');
reg('post', '/api/v1/dashboard/catalog/products/{id}/tags', cat, 'Add product tag');
reg('delete', '/api/v1/dashboard/catalog/products/{id}/tags/{tagId}', cat, 'Remove product tag');

// ── menus ──────────────────────────────────────────────────────────────────
const menus = ['Menus'];
reg('get', '/api/v1/dashboard/menus/{id}', menus, 'Get menu');
reg('patch', '/api/v1/dashboard/menus/{id}', menus, 'Update menu');
reg('delete', '/api/v1/dashboard/menus/{id}', menus, 'Delete menu');
reg('get', '/api/v1/dashboard/menus/{id}/sections', menus, 'List menu sections');
reg('patch', '/api/v1/dashboard/menus/{id}/sections/{sectionId}', menus, 'Update menu section');
reg('delete', '/api/v1/dashboard/menus/{id}/sections/{sectionId}', menus, 'Delete menu section');
reg('get', '/api/v1/dashboard/menus/{id}/sections/{sectionId}/products', menus, 'List section products');
reg('delete', '/api/v1/dashboard/menus/{id}/sections/{sectionId}/products/{productId}', menus, 'Remove section product');
reg('get', '/api/v1/dashboard/menus/{id}/assignments', menus, 'List menu assignments');
reg('delete', '/api/v1/dashboard/menus/{id}/assignments/{assignmentId}', menus, 'Delete menu assignment');

// ── workflows ──────────────────────────────────────────────────────────────
const wf = ['Workflows'];
reg('post', '/api/v1/dashboard/workflows', wf, 'Create workflow');
reg('patch', '/api/v1/dashboard/workflows/{id}', wf, 'Update workflow');
reg('get', '/api/v1/dashboard/workflows/{id}/steps', wf, 'List workflow steps');
reg('post', '/api/v1/dashboard/workflows/{id}/steps', wf, 'Create workflow step');
reg('patch', '/api/v1/dashboard/workflows/{id}/steps/{stepId}', wf, 'Update workflow step');
reg('get', '/api/v1/dashboard/workflows/{id}/transitions', wf, 'List workflow transitions');
reg('post', '/api/v1/dashboard/workflows/{id}/transitions', wf, 'Create workflow transition');
reg('patch', '/api/v1/dashboard/workflows/{id}/transitions/{transitionId}', wf, 'Update workflow transition');
reg('post', '/api/v1/dashboard/workflows/steps/{id}/actions', wf, 'Create step action');
reg('post', '/api/v1/dashboard/workflows/transitions/{id}/conditions', wf, 'Create transition condition');

// ── features-dashboard ─────────────────────────────────────────────────────
const feat = ['Features & Dashboard'];
reg('patch', '/api/v1/dashboard/feature-groups/{id}', feat, 'Update feature group');
reg('delete', '/api/v1/dashboard/feature-groups/{id}', feat, 'Delete feature group');
reg('patch', '/api/v1/dashboard/modules/{id}', feat, 'Update module');
reg('delete', '/api/v1/dashboard/modules/{id}', feat, 'Delete module');
reg('patch', '/api/v1/dashboard/feature-flags/{id}', feat, 'Update feature flag');
reg('delete', '/api/v1/dashboard/feature-flags/{id}', feat, 'Delete feature flag');
reg('patch', '/api/v1/dashboard/dashboard-pages/{id}', feat, 'Update dashboard page');
reg('delete', '/api/v1/dashboard/dashboard-pages/{id}', feat, 'Delete dashboard page');
reg('get', '/api/v1/dashboard/roles/{roleId}/features', feat, 'List role features');
// ── catalog sub-resources: read + media routes that had no registerPath ────
reg('get', '/api/v1/dashboard/catalog/products/{id}/variants', cat, 'List product variants');
reg('get', '/api/v1/dashboard/catalog/products/{id}/option-groups', cat, 'List product option groups');
reg('get', '/api/v1/dashboard/catalog/products/{id}/availability', cat, 'List product availability');
reg('get', '/api/v1/dashboard/catalog/products/{id}/tags', cat, 'List product tags');
reg('get', '/api/v1/dashboard/catalog/products/{id}/media', cat, 'List product media');
reg('post', '/api/v1/dashboard/catalog/products/{id}/image', cat, 'Upload product image');
reg('put', '/api/v1/dashboard/catalog/products/{id}/image', cat, 'Set product image URL');
reg('delete', '/api/v1/dashboard/catalog/products/{id}/media/{mediaId}', cat, 'Delete product media');

// ── dashboard companies / RBAC reads ──────────────────────────────────────
reg('get', '/api/v1/dashboard/companies/{id}', ['Companies'], 'Get company');
reg('get', '/api/v1/dashboard/companies/{id}/documents', ['Companies'], 'List company documents');
reg('get', '/api/v1/dashboard/roles/{id}', ['RBAC'], 'Get role');
reg('get', '/api/v1/dashboard/users', ['RBAC'], 'List dashboard users');

// ── July storefront work: ecommerce ordering, custom products, payments,
// receipts, analytics and the assistant. Registered here so the §21.6 gate
// covers them; replace with co-located registerPath entries when those
// modules get their schema files fleshed out.
const company = [{ companyBearerAuth: [] as string[] }];

function regCompany(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  tags: string[],
  summary: string,
) {
  registry.registerPath({
    method,
    path,
    tags,
    summary,
    security: company,
    responses: {
      200: { description: summary },
      201: { description: summary },
      204: { description: summary },
    },
  });
}

const store = ['Storefront'];
regCompany('get', '/api/v1/company/catalog/custom-products', store, 'List company custom products');
regCompany('post', '/api/v1/company/catalog/custom-products', store, 'Request a custom product');
regCompany('get', '/api/v1/company/onboarding/status', store, 'Get onboarding status');
regCompany('get', '/api/v1/company/onboarding/documents', store, 'List onboarding documents');
regCompany('get', '/api/v1/company/orders/calendar', store, 'Company order calendar');
regCompany('post', '/api/v1/company/orders/schedule', store, 'Schedule a recurring order');
regCompany('get', '/api/v1/company/orders/{id}/payment', store, 'Get order payment');
regCompany('post', '/api/v1/company/orders/{id}/payment-proof', store, 'Upload payment proof');
regCompany('get', '/api/v1/company/orders/{id}/receipt', store, 'Download order receipt');

reg('get', '/api/v1/dashboard/catalog/custom-products', cat, 'List custom product requests');
reg('post', '/api/v1/dashboard/catalog/custom-products/{id}/approve', cat, 'Approve custom product');
reg('post', '/api/v1/dashboard/catalog/custom-products/{id}/reject', cat, 'Reject custom product');
reg('get', '/api/v1/dashboard/catalog/company-assignments', cat, 'List company pricing assignments');
reg('delete', '/api/v1/dashboard/catalog/company-assignment/{id}', cat, 'Remove company pricing assignment');
reg('post', '/api/v1/dashboard/menus/{id}/set-general', menus, 'Mark menu as the general menu');
reg('patch', '/api/v1/dashboard/orders/{id}', ['Orders'], 'Update order');
reg('get', '/api/v1/dashboard/orders/{id}/payment', ['Orders'], 'Get order payment');
reg('post', '/api/v1/dashboard/orders/{id}/payment/approve', ['Orders'], 'Approve order payment');
reg('post', '/api/v1/dashboard/orders/{id}/payment/reject', ['Orders'], 'Reject order payment');
reg('get', '/api/v1/dashboard/orders/{id}/receipt', ['Receipts'], 'Download order receipt');
reg('get', '/api/v1/dashboard/orders/{id}/fulfillment-qr', ['Fulfillment'], 'Get fulfillment QR payload');
reg('get', '/api/v1/dashboard/analytics/overview', ['Analytics'], 'Dashboard analytics overview');
reg('post', '/api/v1/dashboard/assistant/chat', ['Assistant'], 'Assistant chat turn');
reg('get', '/api/v1/dashboard/approval-workflows/{id}', ['Approvals'], 'Get approval workflow');

registry.registerPath({
  method: 'get',
  path: '/api/v1/public/catalog/menu',
  tags: ['Storefront'],
  summary: 'Public storefront menu',
  responses: { 200: { description: 'Public storefront menu' } },
});
