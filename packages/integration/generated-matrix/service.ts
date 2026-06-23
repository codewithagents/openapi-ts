// This file is auto-generated. Do not edit manually.

import type {
  MxAllOfRefs,
  MxAllOfWithSiblingProps,
  MxAllPrimitivesContainer,
  MxAnyOfRefs,
  MxAnyOfWithNull,
  MxArraysContainer,
  MxCompositionContainer,
  MxCycleCompA,
  MxCycleCompB,
  MxCyclicContainer,
  MxEnumConstContainer,
  MxFormatsContainer,
  MxIntegerEnum,
  MxMultiTypeContainer,
  MxMutualA,
  MxMutualB,
  MxNullableContainer,
  MxObjectsContainer,
  MxOneOfDiscriminator,
  MxOneOfRefs,
  MxRecord,
  MxString,
  MxTreeNode,
  MxTuple,
  MxTupleWithRest,
} from './schema-types.js'

export interface MatrixCoverageSpecService {
  /** GET /matrix/primitives */
  getPrimitiveEcho(input: {
    query: {
      strParam?: string
      emailParam?: string
      uuidParam?: string
      dateParam?: string
      intParam?: number
      int32Param?: number
      numParam?: number
      boolParam?: boolean
    }
  }): Promise<MxAllPrimitivesContainer>
  /** GET /matrix/primitives/{id}/{code} */
  getPrimitiveByPath(input: { params: { id: string; code: string } }): Promise<MxFormatsContainer>
  /** GET /matrix/enums */
  getEnumEcho(input: {
    query: { strEnum?: string; intEnum?: string }
  }): Promise<MxEnumConstContainer>
  /** GET /matrix/enums/{pathEnum} */
  getEnumByPath(input: { params: { pathEnum: string } }): Promise<MxIntegerEnum>
  /** POST /matrix/arrays */
  postArrays(input: { body: MxArraysContainer }): Promise<MxArraysContainer>
  /** POST /matrix/objects */
  postObjects(input: { body: MxObjectsContainer }): Promise<MxObjectsContainer>
  /** POST /matrix/nullable */
  postNullable(input: { body: MxNullableContainer }): Promise<MxNullableContainer>
  /** POST /matrix/composition */
  postComposition(input: { body: MxCompositionContainer }): Promise<MxCompositionContainer>
  /** POST /matrix/cyclic */
  postCyclic(input: { body: MxCyclicContainer }): Promise<MxCyclicContainer>
  /** POST /matrix/multitypes */
  postMultiTypes(input: { body: MxMultiTypeContainer }): Promise<MxMultiTypeContainer>
  /** GET /matrix/primitives-direct */
  getPrimitiveDirect(): Promise<MxString>
  /** POST /matrix/record-direct */
  postRecordDirect(input: { body: MxRecord }): Promise<MxRecord>
  /** POST /matrix/allof-direct */
  postAllOfDirect(input: { body: MxAllOfRefs }): Promise<MxAllOfWithSiblingProps>
  /** POST /matrix/anyof-direct */
  postAnyOfDirect(input: { body: MxAnyOfRefs }): Promise<MxAnyOfWithNull>
  /** POST /matrix/oneof-direct */
  postOneOfDirect(input: { body: MxOneOfRefs }): Promise<MxOneOfDiscriminator>
  /** POST /matrix/self-recursive */
  postSelfRecursive(input: { body: MxTreeNode }): Promise<MxTreeNode>
  /** POST /matrix/mutual-cycle */
  postMutualCycle(input: { body: MxMutualA }): Promise<MxMutualB>
  /** POST /matrix/cycle-composition */
  postCycleComposition(input: { body: MxCycleCompA }): Promise<MxCycleCompB>
  /** POST /matrix/tuple-direct */
  postTupleDirect(input: { body: MxTuple }): Promise<MxTupleWithRest>
}
