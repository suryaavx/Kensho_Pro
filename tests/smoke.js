if (typeof window === 'undefined' || typeof document === 'undefined') {
  if (typeof module !== 'undefined') module.exports = { skippedInHeadlessNode: true };
} else (async()=>{ const sleep=t=>new Promise(r=>setTimeout(r,t));
 const log=[]; log.push('menus '+document.querySelectorAll('.mb').length+' icons '+document.querySelectorAll('svg.ic').length+' view '+document.body.dataset.view);
 document.querySelectorAll('.mb')[0].click(); await sleep(300); log.push('file menu items '+document.querySelectorAll('.dd .mi').length);
 return log; })()
