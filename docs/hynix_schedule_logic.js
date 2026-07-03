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

  function isGyuEmployee(empId, emp) {
    return employeeLabels(empId, emp).some(label => {
      return label === '규' || label === '원규' || label === '이원규' || label.endsWith('원규');
    });
  }

  function canonicalFixedScheduleEntry(empId, emp, fixed) {
    if (isGyuEmployee(empId, emp)) {
      return { start: '17:00', end: '06:00', role: '주방,오토바이' };
    }
    return fixed && typeof fixed === 'object' ? fixed : null;
  }

  return {
    canonicalFixedScheduleEntry: canonicalFixedScheduleEntry,
    employeeLabels: employeeLabels,
    isGyuEmployee: isGyuEmployee
  };
});
