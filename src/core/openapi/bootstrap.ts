/**
 * Ensures all module schema side-effects and supplemental path registrations
 * run before OpenAPI document generation.
 */
import '../../routes/index';
import './registerMissingPaths';
