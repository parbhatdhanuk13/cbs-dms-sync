// CBS branchId → DMS branchId
const BRANCH_MAP = {
  1: 2,    // Kathmandu
  2: 3,    // Pokhara
  7: 8,
  10: 12,
};

// CBS documentTypeId → DMS attachmentTypeId
const DOCUMENT_TYPE_MAP = {
  1: 2,   // Identity documents
  2: 3,   // Loan-file documents
  3: 4,   // Deposit vouchers
  4: 5,   // General vouchers
  5: 6,   // Inter-branch transfer vouchers
};

// DMS container documentTypeId
const DMS_DOCUMENT_TYPE_ID = 1;

// DMS document_index_ids
const DOCUMENT_INDEX_IDS = {
  CENTER_ID: 1,
  GROUP_ID: 2,
  MEMBER_ID: 3,
  MEMBER_NAME: 4,
};

module.exports = {
  BRANCH_MAP,
  DOCUMENT_TYPE_MAP,
  DMS_DOCUMENT_TYPE_ID,
  DOCUMENT_INDEX_IDS,
};