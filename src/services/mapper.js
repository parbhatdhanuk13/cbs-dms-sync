const {
  BRANCH_MAP,
  DOCUMENT_TYPE_MAP,
  DOCUMENT_INDEX_IDS,
} = require("../config/mappings");

class MappingError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "MappingError";
    this.statusCode = 400;
  }
}

function mapBranch(cbsBranchId) {
  const dms = BRANCH_MAP[cbsBranchId];
  if (!dms) throw new MappingError(`No DMS branch mapping for CBS branchId=${cbsBranchId}`);
  return dms;
}

function mapAttachmentType(cbsDocumentTypeId) {
  const dms = DOCUMENT_TYPE_MAP[cbsDocumentTypeId];
  if (!dms)
    throw new MappingError(
      `No DMS attachmentType mapping for CBS documentTypeId=${cbsDocumentTypeId}`
    );
  return dms;
}

function buildIndexValues(cbsDoc) {
  const values = [
    { documentIndexId: DOCUMENT_INDEX_IDS.CENTER_ID,   value: String(cbsDoc.centerId   ?? "").trim() },
    { documentIndexId: DOCUMENT_INDEX_IDS.GROUP_ID,    value: String(cbsDoc.groupId    ?? "").trim() },
    { documentIndexId: DOCUMENT_INDEX_IDS.MEMBER_ID,   value: String(cbsDoc.memberId ?? cbsDoc.sourceKey ?? "").trim() },
    { documentIndexId: DOCUMENT_INDEX_IDS.MEMBER_NAME, value: String(cbsDoc.memberName ?? "").trim() },
  ];

  // memberId is mandatory
  const memberId = values.find((v) => v.documentIndexId === DOCUMENT_INDEX_IDS.MEMBER_ID)?.value;
  if (!memberId) {
    throw new MappingError(`CBS doc ${cbsDoc.sourceKey}: memberId is missing`);
  }

  // Fill defaults for optional
  for (const v of values) {
    if (!v.value && v.documentIndexId !== DOCUMENT_INDEX_IDS.MEMBER_ID) {
      v.value = "-";
    }
  }

  return values;
}

module.exports = { mapBranch, mapAttachmentType, buildIndexValues, MappingError };