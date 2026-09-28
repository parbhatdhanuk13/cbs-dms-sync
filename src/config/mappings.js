// CBS branchId → DMS branchId
const BRANCH_MAP = {
  4: 1,    // pokhara
  5: 2,    // Dhangadhi
  6: 3,   // Baneshwor
};

// CBS documentTypeId → DMS attachmentTypeId
const DOCUMENT_TYPE_MAP = {
  1: 1068,   // Member Identity documents
  2: 1069,   // Loan-file documents
  3: 1070,   // Deposit vouchers
  4: 1071,   // General vouchers
  5: 1072,   // Inter-branch transfer(IBT) vouchers
};

// DMS container documentTypeId
const DMS_DOCUMENT_TYPE_ID = 1067;

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