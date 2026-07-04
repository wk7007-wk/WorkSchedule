(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HynixScheduleLogic = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function cleanLabel(value) {
    return String(value || '').replace(/\s+/g, '').trim();
  }

  function employeeLabels(empId, emp) {
    const aliases = Array.isArray(emp && emp.aliases) ? emp.aliases : [];
    const labels = [empId, emp && emp.short_name, emp && emp.nickname, emp && emp.nick, emp && emp.name];
    aliases.forEach(alias => labels.push(alias));
    return labels.map(cleanLabel).filter(Boolean);
  }

  function canonicalFixedScheduleEntry(empId, emp, fixed) {
    return fixed && typeof fixed === 'object' ? fixed : null;
  }

  return {
    canonicalFixedScheduleEntry: canonicalFixedScheduleEntry,
    employeeLabels: employeeLabels
  };
});
