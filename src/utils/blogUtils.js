function formatBlog(row, sections) {
  if (!row) return null;
  
  let parsedSections = [];
  if (Array.isArray(sections)) {
    parsedSections = sections;
  } else if (typeof sections === 'string') {
    try {
      parsedSections = JSON.parse(sections);
    } catch (e) {
      parsedSections = [];
    }
  } else if (row.sections) {
    if (Array.isArray(row.sections)) {
      parsedSections = row.sections;
    } else if (typeof row.sections === 'string') {
      try {
        parsedSections = JSON.parse(row.sections);
      } catch (e) {
        parsedSections = [];
      }
    }
  }

  return {
    ...row,
    sections: parsedSections
  };
}

function sanitizeTiptapContent(content) {
  if (!content) return {};
  if (typeof content === 'string') {
    try {
      return JSON.parse(content);
    } catch (e) {
      return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: content }] }] };
    }
  }
  return content;
}

module.exports = {
  formatBlog,
  sanitizeTiptapContent
};
