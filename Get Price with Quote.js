(function() {
        var tag = new Object();
        tag['TAG001'] = 'Price not calculated, because entitlement check has not been performed.';
        tag['TAG002'] = 'Part is not covered by contract.';
        tag['TAG003'] = 'Part is covered by warranty.';
        tag['TAG004'] = 'Labor is covered by contract.';
        tag['TAG005'] = 'Labor is not covered by contract.';
        tag['TAG006'] = 'Labor is covered by warranty';
        tag['TAG007'] = 'Expense is covered by contract.';
        tag['TAG008'] = 'Expense is not covered by contract.';
        tag['TAG009'] = 'Expense is covered by warranty.';
        tag['TAG010'] = 'Travel is covered by contract.';
        tag['TAG011'] = 'Travel is not covered by contract.';
        tag['TAG012'] = 'Travel is covered by warranty.';
        tag['TAG013'] = 'Parts price defined in contract.';
        tag['TAG014'] = 'Parts price defined in contract price book.';
        tag['TAG015'] = 'Parts price defined in standard price book.';
        tag['TAG016'] = 'Parts discount defined in contract.';
        tag['TAG017'] = 'Labor Price defined in contract.';
        tag['TAG018'] = 'Labor Price defined in contract price book.';
        tag['TAG019'] = 'Labor Price defined in standard price book.';
        tag['TAG020'] = 'Expense Price defined in contract.';
        tag['TAG021'] = 'Travel price defined in contract.';
        tag['TAG022'] = 'No expense price found for ';
        tag['TAG023'] = 'No travel price found';
        tag['TAG024'] = 'The price for this part could not be determined. Please verify that a price for this part has been set in the service contract or product price book.';
        tag['TAG025'] = 'The price for this labor entry cannot be determined. Please verify that a price for this activity has been set in the contract or service price book.';
        tag['TAG026'] = 'No warranty found.';
        tag['TAG027'] = 'No service offering found.';
        tag['TAG028'] = 'A special price is available for ';
        tag['TAG029'] = 'Part is covered by contract.';
        tag['TAG030'] = 'A special price is available for the PRODUCT: ';
        var setting = new Object();
        var recordTypeName = new Object();
        var IBWarranty = new Object();
        var PSEntitled = new Object();
        var IBSconPartsPricing = new Object();
        var IBSconPartsDiscount = new Object();
        var IBSconLaborPricing = new Object();
        var LinePartPriceBook = new Object();
        var LineLaborPriceBook = new Object();
        var IBSconDefinition = new Object();
        var IBExpenseInfo = new Object();
        var totalWorkOrderPrice = 0;

        function getQuantityField(record) {
            var recordTypeId = getItemForDetailRecordKey("RecordTypeId", record);
            if (recordTypeName[recordTypeId.value] == 'Estimate') {
                return 'Estimated_Quantity2__c';
            }
            if (recordTypeName[recordTypeId.value] == 'Usage/Consumption') {
                return 'Actual_Quantity2__c';
            }
        }

        function getUnitPriceField(record) {
            var recordTypeId = getItemForDetailRecordKey("RecordTypeId", record);
            if (recordTypeName[recordTypeId.value] == 'Estimate') {
                return 'Estimated_Price2__c';
            }
            if (recordTypeName[recordTypeId.value] == 'Usage/Consumption') {
                return 'Actual_Price2__c';
            }
        }

        function getTotalLinePriceField(record) {
            var recordTypeId = getItemForDetailRecordKey("RecordTypeId", record);
            if (recordTypeName[recordTypeId.value] == 'Estimate') {
                return 'Billable_Line_Price__c';
            }
            if (recordTypeName[recordTypeId.value] == 'Usage/Consumption') {
                return 'Billable_Line_Price__c';
            }
        }

        function processPartLine(record, pb, recordType, params) {
            var linePriceField = getItemForDetailRecordKey(getTotalLinePriceField(record), record);
            var unitPriceField = getItemForDetailRecordKey(getUnitPriceField(record), record);
            var discountField = getItemForDetailRecordKey("Discount__c", record);
            var product = getItemForDetailRecordKey("Product__c", record);
            var coverageField = getItemForDetailRecordKey("Covered__c", record);
            var up = getUnitPriceForPart(product, pb, recordType, params);
            if (up.tag != null) {
                var appliedCoverage = {
                    applied: false,
                    isCovered: false
                };
                var discount = 0;
                if (up.tag == 'TAG014' || up.tag == 'TAG015') {
                    discount = getPartDiscount(product, pb, params);
                }
                if (discount > 0) {
                    addLogWorkOrderLine(params.logField, tag['TAG016']);
                }
                discountField.value = getOnlyPositiveValue(discount);
                if (!params.isLineEntitled) {
                    coverageField.value = 0;
                    var customCoverage = getPartCustomCoverage(product, pb);
                    if (customCoverage) {
                        appliedCoverage = applyServiceOffering(coverageField, customCoverage, "Parts_Discount_Covered__c", "Parts_Discount_Not_Covered__c");
                    }

                    if (!appliedCoverage.applied) {
                        appliedCoverage = applyServiceOffering(coverageField, params.so, "Parts_Discount_Covered__c", "Parts_Discount_Not_Covered__c");
                    }
                }
                if (!appliedCoverage.applied) {
                    if (applyWarranty(coverageField, params, "Material_Covered__c")) {
                        addLogWorkOrderLine(params.logField, tag['TAG003']);
                    }
                } else {
                    appliedCoverage.isCovered == true ? addLogWorkOrderLine(params.logField, tag['TAG029']) : addLogWorkOrderLine(params.logField, tag['TAG002']);
                }

                addLogWorkOrderLine(params.logField, tag[up.tag]);

                up = getOnlyPositiveValue(up.value);
                unitPriceField.value = up;
                params.quantity = (params.quantity).toFixed(3);
                params.calculatedQuantityField.value = params.quantity;
                var rate = params.quantity * up;

                var totalLinePrice = getBillableLinePrice(rate, discountField, coverageField);
                linePriceField.value = totalLinePrice;
                if (params.isBillable) {
                    totalWorkOrderPrice += parseFloat(totalLinePrice);
                }
            } else {
                linePriceField.value = 0;
                unitPriceField.value = 0;
                coverageField.value = 0;
                params.calculatedQuantityField.value = 0;
                addLogWorkOrderLine(params.logField, tag['TAG024']);
                return;
            }
        }

        function getUnitPriceForPart(product, pb, recordType, params) {
            var ret = new Object();
            ret.value = -1;
            ret.tag = null;
            /* Check if a special pricing is available as part of service contract */
            ret.value = getUnitPriceFromPartsSpecialPricing(product, pb, params);

            if (ret.value != -1) ret.tag = 'TAG013';

            if (ret.value == -1) {
                /* Check if a service contract exists. Assumption is that if no contract is available, then this item will NOT be available */
                var recordTypeKey = 'RECORDTYPEINFO_PARTS_CONTRACT';
                /*if(recordTypeInfo)
                  pbKey = getPriceBookIdForRecordType(recordType, recordTypeInfo);    */
                ret.value = getUnitPriceFromPartsPricing(recordTypeKey, pb, product, params, recordType);
                if (ret.value != -1) ret.tag = 'TAG014';
            }
            /* No price book is available for this record type under service contract, switch to basic calculation */

            if (ret.value == -1) {
                ret.value = getBasicUnitPriceForPart(product, pb, recordType, params);
                if (ret.value != -1) ret.tag = 'TAG015';
            }

            if (ret.value == -1) ret.value = 0;

            return ret;
        }

        function getBasicUnitPriceForPart(product, pb, recordType, params) {
            var recordTypeKey = 'RECORDTYPEINFO_PARTS',
                ret = -1;
            ret = getUnitPriceFromPartsPricing(recordTypeKey, pb, product, params, recordType);
            return ret;
        }

        function getUnitPriceFromPartsSpecialPricing(product, pb, params) {
            var specialPricing;
            var detailLineId = params.detailLineId;
            if (!params.isLineEntitled) {
                specialPricing = getFromPriceBookDefinition(pb, "CONTRACT_SPECIALPARTSPRICING");
            } else {
                if (IBSconPartsPricing && IBSconPartsPricing[detailLineId]) {
                    specialPricing = new Object();
                    specialPricing.data = [];
                    for (var i in IBSconPartsPricing[detailLineId]) {
                        specialPricing.data.push(IBSconPartsPricing[detailLineId][i]);
                    }
                }
            }

            var ret = -1;
            if (specialPricing) {
                var allSpecialPricing = specialPricing.data,
                    l = allSpecialPricing.length;
                for (var i = 0; i < l; i++) {
                    if (allSpecialPricing[i][getQualifiedFieldName("Product__c")] == product.value) {
                        ret = allSpecialPricing[i][getQualifiedFieldName("Price_Per_Unit__c")];
                        addLogWorkOrderLine(params.logField, tag['TAG030'] + product.value1 + '.');
                        break;
                    }
                }
            }
            return ret;
        }

        /**
         * @returns price if a matching pricebook is found, -1 otherwise
         */
        function getUnitPriceFromPartsPricing(recordTypeKey, pb, product, params, recordType) {
            var partsPricingInfo, detailLineId = params.detailLineId,
                pbKey, ret = -1;
            var recordTypeInfo = getFromPriceBookDefinition(pb, recordTypeKey);
            if (recordTypeInfo)
                pbKey = getPriceBookIdForRecordType(recordType, recordTypeInfo);
            partsPricingInfo = getFromPriceBookDefinition(pb, "PARTSPRICING");
            if (params.isLineEntitled) {
                if (recordTypeKey == 'RECORDTYPEINFO_PARTS_CONTRACT') {
                    recordTypeKey = 'RECORDTYPEINFO_PARTS';
                    partsPricingInfo = null;
                    if (LinePartPriceBook && LinePartPriceBook[detailLineId]) {
                        pbKey = null;
                        partsPricingInfo = new Object();
                        partsPricingInfo.data = [];
                        partsPricingInfo.data = LinePartPriceBook[detailLineId];
                    }
                }
            }

            if (partsPricingInfo) {
                var allProductsInfo = partsPricingInfo.data,
                    l = allProductsInfo.length,
                    i;
                for (i = 0; i < l; i++) {
                    if (((recordTypeKey != 'RECORDTYPEINFO_PARTS_CONTRACT' && pbKey == null) ||
                            (pbKey != null && pbKey == allProductsInfo[i].Pricebook2Id)) && allProductsInfo[i].Product2Id == product.value) {
                        ret = allProductsInfo[i].UnitPrice;
                        break;
                    }
                }
            }
            return ret;
        }

        function getPartDiscount(product, pb, params) {
            var discountDefinitionInfo;
            var prodDefinition = getProductDefinition(pb, product),
                ret = null;
            var detailLineId = params.detailLineId;
            if (prodDefinition) {
                if (!params.isLineEntitled) {
                    discountDefinitionInfo = getFromPriceBookDefinition(pb, "CONTRACT_PARTSDISCOUNT");
                } else {
                    if (IBSconPartsDiscount && IBSconPartsDiscount[detailLineId]) {
                        discountDefinitionInfo = new Object();
                        discountDefinitionInfo.data = [];
                        for (var i in IBSconPartsDiscount[detailLineId]) {
                            discountDefinitionInfo.data.push(IBSconPartsDiscount[detailLineId][i]);
                        }
                    }
                }
                if (discountDefinitionInfo) {
                    var allDiscountDefinitionInfo = discountDefinitionInfo.data,
                        j, dlength = allDiscountDefinitionInfo.length,
                        bfound = true;
                    for (j = 0; j < dlength; j++) {
                        bfound = false;
                        var discountDefinition = allDiscountDefinitionInfo[j];
                        if (discountDefinition[getQualifiedFieldName("Product__c")] == prodDefinition['Id']) {
                            bfound = true;
                        } else if (prodDefinition[getQualifiedFieldName("Product_Line__c")] && discountDefinition[getQualifiedFieldName("Product_Line__c")] == prodDefinition[getQualifiedFieldName("Product_Line__c")]) {
                            bfound = true;
                        } else if (prodDefinition["Family"] && discountDefinition[getQualifiedFieldName("Product_Family__c")] == prodDefinition["Family"]) {
                            bfound = true;
                        }

                        if (bfound) {
                            ret = discountDefinition[getQualifiedFieldName("Discount_Percentage__c")];
                            break;
                        }
                    }
                }
            }
            return ret;
        }

        function getPartCustomCoverage(product, pb) {

            var prodDefinition = getProductDefinition(pb, product),
                ret = null;

            if (prodDefinition) {
                var customCoverageInfo = getFromPriceBookDefinition(pb, "CONTRACT_CUSTOMCOVERAGE");
                if (customCoverageInfo) {
                    var customCoverages = customCoverageInfo.data,
                        j, dlength = customCoverages.length,
                        bfound = false;
                    var productTypeField = getQualifiedFieldName("Product_Type__c");
                    for (j = 0; j < dlength; j++) {
                        var customCoverage = customCoverages[j];
                        if (customCoverage[productTypeField] == prodDefinition[productTypeField]) {
                            bfound = true;
                        }

                        if (bfound) {
                            ret = customCoverage;
                            ret.isCovered = (customCoverageInfo.value == "COVERED") ? true : false;
                            break;
                        }
                    }
                }
            }
            return ret;
        }
        /*///////////////////////////////////////////////// END - PARTS FUNCTIONS ////////////////////////////////////////////*/

        /*///////////////////////////////////////////////// START - LABOR FUNCTIONS //////////////////////////////////////////*/
        function processLaborLine(record, pb, recordType, params) {
            var linePriceField = getItemForDetailRecordKey(getTotalLinePriceField(record), record);
            var unitPriceField = getItemForDetailRecordKey(getUnitPriceField(record), record);
            var activityType = getItemForDetailRecordKey("Activity_Type__c", record);
            var coverageField = getItemForDetailRecordKey("Covered__c", record);
            var unitType = getItemForDetailRecordKey("Applied_Rate_Type__c", record);
            var product = getItemForDetailRecordKey("Product__c", record);
            var discountField = getItemForDetailRecordKey("Discount__c", record);
            var up;

            if (setting["WORD005_SET019"] === "Product price book") {
                up = getPriceForLaborAsParts(product, pb, recordType, params);

                var discount = 0;
                if (up.tag == 'TAG014' || up.tag == 'TAG015') {
                    discount = getPartDiscount(product, pb, params);
                }
                if (discount > 0) {
                    addLogWorkOrderLine(params.logField, tag['TAG016']);
                }
                discountField.value = getOnlyPositiveValue(discount);

            } else {
                up = getUnitPriceForLabor(activityType, pb, recordType, record, params);
            }

            if (up.tag != null) {
                var appliedCoverage = {
                    applied: false,
                    isCovered: false
                };
                coverageField.value = 0;
                if (!params.isLineEntitled) {
                    appliedCoverage = applyServiceOffering(coverageField, params.so, "Labor_Discount_Covered__c", "Labor_Discount_Not_Covered__c");
                }
                if (!appliedCoverage.applied) {
                    if (applyWarranty(coverageField, params, "Time_Covered__c"))
                        addLogWorkOrderLine(params.logField, tag['TAG006']);
                } else {
                    appliedCoverage.isCovered == true ? addLogWorkOrderLine(params.logField, tag['TAG004']) : addLogWorkOrderLine(params.logField, tag['TAG005']);
                }
                addLogWorkOrderLine(params.logField, tag[up.tag]);
                up = up.value;
                var rateType = up.rateType,
                    rate = 0,
                    duration, estimateDuration;
                var regularRate = up.regularRate;
                if (!up.regularRate) regularRate = 0;
                var laborRoundingType;
                var laborToRoundNearest;
                var scMinimumLabor;
                var contractDefinitionInfo;
                if (rateType == "Per Hour") {
                    if (!params.isLineEntitled) {
                        contractDefinitionInfo = getFromPriceBookDefinition(pb, "CONTRACT_DEFINITION");
                    } else {
                        var detailLineId = params.detailLineId;
                        if (IBSconDefinition && IBSconDefinition[detailLineId]) {
                            contractDefinitionInfo = new Object();
                            contractDefinitionInfo.data = [];
                            contractDefinitionInfo.data.push(IBSconDefinition[detailLineId]);
                        }
                    }
                    if (contractDefinitionInfo) {
                        contractDefinition = contractDefinitionInfo.data[0];
                        laborRoundingType = contractDefinition[getQualifiedFieldName("Labor_Rounding_Type__c")];
                        laborToRoundNearest = contractDefinition[getQualifiedFieldName("Round_Labor_To_Nearest__c")];
                        scMinimumLabor = contractDefinition[getQualifiedFieldName("Minimum_Labor__c")];
                    }
                    var minDuration = up.minimumUnit ? up.minimumUnit : scMinimumLabor;
                    estimateDuration = getDuration(record, true);

                    if (estimateDuration < 0) {
                        estimateDuration = params.quantity * 60;
                    }

                    if (laborRoundingType && laborToRoundNearest) {
                        estimateDuration = getRounded(laborRoundingType, laborToRoundNearest, estimateDuration);
                    }

                    duration = (minDuration > estimateDuration) ? minDuration : estimateDuration;
                    duration = (duration / 60).toFixed(3);
                    rate = duration * (regularRate);
                    params.calculatedQuantityField.value = duration;
                } else {
                    /* Flat rate*/
                    rate = regularRate;
                    params.calculatedQuantityField.value = 1;
                }

                unitPriceField.value = regularRate;
                /* Added to support both discount and coverage for Labor line based on Global setting */
                var totalLinePrice = (!!discountField) ? getBillableLinePrice(rate, discountField, coverageField) : getBillableLinePrice(rate, null, coverageField);
                linePriceField.value = totalLinePrice;
                if (params.isBillable)
                    totalWorkOrderPrice += parseFloat(totalLinePrice);
                unitType.value = rateType;
            } else {
                linePriceField.value = 0;
                unitPriceField.value = 0;
                coverageField.value = 0;
                params.calculatedQuantityField.value = 0;
                addLogWorkOrderLine(params.logField, tag['TAG025'] + activityType.value);
                return;
            }
        }

        function getPriceForLaborAsParts(product, pb, recordType, params) {

            var up = new Object();
            var rate = getUnitPriceForPart(product, pb, recordType, params);
            up.tag = rate.tag;
            up.value = {
                rateType: "Per Hour",
                regularRate: rate.value,
                minimumUnit: null,
            };
            return up;
        }

        function getUnitPriceForLabor(activityType, pb, recordType, record, params) {
            var ret = new Object();
            ret.value = null;
            ret.tag = null;

            /* Check if a special pricing is available as part of service contract */
            ret.value = getUnitPriceFromLaborSpecialPricing(activityType, pb, record, params);

            if (ret.value != null) ret.tag = 'TAG017';
            if (ret.value == null) {

                /* Check if a service contract exists. Assumption is that if no contract is available, then this item will NOT be available */
                var recordTypeKey = 'RECORDTYPEINFO_LABOR_CONTRACT';
                ret.value = getUnitPriceFromLaborPricing(recordTypeKey, pb, activityType, record, params, recordType);
                if (ret.value != null) ret.tag = 'TAG018';
            }


            /* Get the price book corresponding to record type and do the basic calculation */
            if (ret.value == null) {
                ret.value = getBasicUnitPriceForLabor(activityType, pb, recordType, record, params);
                if (ret.value != null) ret.tag = 'TAG019';
            }

            return ret;
        }

        function getBasicUnitPriceForLabor(activityType, pb, recordType, record, params) {
            var recordTypeKey = 'RECORDTYPEINFO_LABOR',
                ret = null;
            ret = getUnitPriceFromLaborPricing(recordTypeKey, pb, activityType, record, params, recordType);
            return ret;
        }

        function getUnitPriceFromLaborSpecialPricing(activityType, pb, record, params) {
            var detailLineId = params.detailLineId;
            var specialPricing;
            if (!params.isLineEntitled) {
                specialPricing = getFromPriceBookDefinition(pb, "CONTRACT_SPECIALLABORPRICING");
            } else {
                if (IBSconLaborPricing && IBSconLaborPricing[detailLineId]) {
                    specialPricing = new Object();
                    specialPricing.data = [];
                    for (var i in IBSconLaborPricing[detailLineId]) {
                        specialPricing.data.push(IBSconLaborPricing[detailLineId][i]);
                    }
                }
            }
            var ret = null;
            if (specialPricing) {
                var allSpecialPricing = specialPricing.data,
                    l = allSpecialPricing.length,
                    defaultPricing;
                for (var i = 0; i < l; i++) {
                    var pricing = allSpecialPricing[i];
                    if (pricing[getQualifiedFieldName("Activity_Type__c")] == activityType.value) {

                        ret = extractLaborPricing(pricing, record, pb, "Minimum_Labor__c");
                        if (ret) {
                            defaultPricing = ret;
                            if (ret.found) break;
                        } else {
                            ret = defaultPricing;
                        }
                    }
                }
            }

            if (ret) addLogWorkOrderLine(params.logField, tag['TAG028'] + activityType.value);

            return ret;
        }

        function getUnitPriceFromLaborPricing(recordTypeKey, pb, activityType, record, params, recordType) {
            var pbKey;
            var laborPricingInfo, ret = null;
            var detailLineId = params.detailLineId;
            var recordTypeInfo = getFromPriceBookDefinition(pb, recordTypeKey);
            if (recordTypeInfo)
                pbKey = getPriceBookIdForRecordType(recordType, recordTypeInfo);
            laborPricingInfo = getFromPriceBookDefinition(pb, "LABORPRICING");
            if (params.isLineEntitled) {
                if (recordTypeKey == 'RECORDTYPEINFO_LABOR_CONTRACT') {
                    recordTypeKey = 'RECORDTYPEINFO_LABOR';
                    laborPricingInfo = null;
                    if (LineLaborPriceBook && LineLaborPriceBook[detailLineId]) {
                        pbKey = null;
                        laborPricingInfo = new Object();
                        laborPricingInfo.data = [];
                        laborPricingInfo.data = LineLaborPriceBook[detailLineId];
                    }
                }
            }

            if (laborPricingInfo) {
                /* Get the price book corresponding to the product type */
                var allLaborPricingInfo = laborPricingInfo.data,
                    l = allLaborPricingInfo.length,
                    i, defaultPricing;
                for (i = 0; i < l; i++) {
                    var pricing = allLaborPricingInfo[i];
                    if (((recordTypeKey != 'RECORDTYPEINFO_LABOR_CONTRACT' && pbKey == null) ||
                            (pbKey != null && pbKey == pricing[getQualifiedFieldName("Price_Book__c")])) && pricing[getQualifiedFieldName("Activity_Type__c")] == activityType.value) {
                        ret = extractLaborPricing(pricing, record, pb);
                        if (ret) {
                            defaultPricing = ret;
                            if (ret.found) break;
                        } else {
                            ret = defaultPricing;
                        }
                    }
                }
            }

            return ret;
        }

        function extractLaborPricing(pricing, record, pb, minLaborField) {

            var isAssociatedWithProduct = !!pricing[getQualifiedFieldName("Activity_Product__c")],
                ret = null;
            var product = getItemForDetailRecordKey("Product__c", record);
            if (!product || !product.value || product.value == "") product = woProduct;
            if (isAssociatedWithProduct && product && product.value && product.value != "") {
                var prodDefinition = getProductDefinition(pb, product),
                    bfound = false;
                if (!prodDefinition) return;
                if ((get15CharId(pricing[getQualifiedFieldName("Product__c")]) == get15CharId(product.value))) {
                    bfound = true;
                } else if (prodDefinition[getQualifiedFieldName("Product_Line__c")] && pricing[getQualifiedFieldName("Product_Line__c")] == prodDefinition[getQualifiedFieldName("Product_Line__c")]) {
                    bfound = true;
                } else if (prodDefinition["Family"] && pricing[getQualifiedFieldName("Product_Family__c")] == prodDefinition["Family"]) {
                    bfound = true;
                }
                if (bfound) {
                    ret = {
                        rateType: pricing[getQualifiedFieldName("Unit__c")],
                        regularRate: pricing[getQualifiedFieldName("Regular_Rate__c")],
                        minimumUnit: minLaborField != null ? pricing[getQualifiedFieldName(minLaborField)] : null,
                        found: true
                    };
                }
            } else {
                ret = {
                    rateType: pricing[getQualifiedFieldName("Unit__c")],
                    regularRate: pricing[getQualifiedFieldName("Regular_Rate__c")],
                    minimumUnit: minLaborField != null ? pricing[getQualifiedFieldName(minLaborField)] : null
                };
                if (!product) ret.found = true;
            }
            return ret;
        }

        /*///////////////////////////////////////////////// END - LABOR FUNCTIONS ////////////////////////////////////////////*/

        /*///////////////////////////////////////////////// START - EXPENSE FUNCTIONS ////////////////////////////////////////*/
        function processExpenseLine(record, pb, params) {
            var expenseType = getItemForDetailRecordKey("Expense_Type__c", record);
            var linePriceField = getItemForDetailRecordKey(getTotalLinePriceField(record), record);
            var unitPriceField = getItemForDetailRecordKey(getUnitPriceField(record), record);
            var coverageField = getItemForDetailRecordKey("Covered__c", record);


            if (expenseType != "" && expenseType.value != null && expenseType.value != "") {
                var expenseInfo = null,
                    expenseDetail = null;

                if (!params.isLineEntitled) {
                    expenseInfo = getFromPriceBookDefinition(pb, "CONTRACT_EXPENSE"), expenseDetail = null;
                } else {
                    var detailLineId = params.detailLineId;
                    if (IBExpenseInfo && IBExpenseInfo[detailLineId]) {
                        expenseInfo = new Object();
                        expenseInfo.data = [];
                        for (var i in IBExpenseInfo[detailLineId]) {
                            expenseInfo.data.push(IBExpenseInfo[detailLineId][i]);
                        }
                    }
                }

                /* Covered by service contract */
                if (expenseInfo) {
                    var allExpensesInfo = expenseInfo.data,
                        l = allExpensesInfo.length;
                    for (var i = 0; i < l; i++) {
                        if (allExpensesInfo[i][getQualifiedFieldName("Expense_Type__c")] == expenseType.value) {
                            expenseDetail = allExpensesInfo[i];
                            break;
                        }
                    }

                    if (expenseDetail != null) {
                        coverageField.value = 0;
                        var appliedCoverage = applyServiceOffering(coverageField, params.so, "Expense_Discount_Covered__c", "Expense_Discount_Not_Covered__c");
                        if (!appliedCoverage.applied) {
                            /*Warranty coverage should not be considered*/
                        } else {
                            appliedCoverage.isCovered == true ? addLogWorkOrderLine(params.logField, tag['TAG007']) : addLogWorkOrderLine(params.logField, tag['TAG008']);
                        }

                        addLogWorkOrderLine(params.logField, tag['TAG020']);
                        var totalLinePrice = 0;
                        params.quantity = (params.quantity).toFixed(3);
                        var rate = expenseDetail[getQualifiedFieldName("Rate__c")];
                        var rateType = expenseDetail[getQualifiedFieldName("Rate_Type__c")];
                        var unitType = getItemForDetailRecordKey("Applied_Rate_Type__c", record);
                        if (rate !== undefined && rate !== null && typeof(rate) === "string") rate = parseFloat(rate);
                        if (rateType == "Per Unit") {
                            unitPriceField.value = rate;
                            totalLinePrice = params.quantity * rate;
                        } else if (rateType == "Flat Rate") {
                            totalLinePrice = rate;
                            params.calculatedQuantityField.value = 1;
                            unitPriceField.value = rate;
                        } else if (rateType == "Markup %") {
                            if (unitPriceField.value && unitPriceField.value != null && unitPriceField.value > 0)
                                totalLinePrice = unitPriceField.value * ((100 + rate) / 100) * params.quantity;
                        } else if (rateType == "Actuals") {
                            if (unitPriceField.value && unitPriceField.value != null && unitPriceField.value > 0)
                                totalLinePrice = unitPriceField.value * params.quantity;
                        } else if (rateType == "Discount %") {
                            if (unitPriceField.value && unitPriceField.value != null && unitPriceField.value > 0)
                                totalLinePrice = unitPriceField.value * ((100 - rate) / 100) * params.quantity;
                        }
                        totalLinePrice = getBillableLinePrice(totalLinePrice, null, coverageField);
                        linePriceField.value = totalLinePrice;
                        if (params.isBillable)
                            totalWorkOrderPrice += parseFloat(totalLinePrice);
                        unitType.value = rateType;
                        params.calculatedQuantityField.value = params.quantity;
                    } else {
                        linePriceField.value = 0;
                        unitPriceField.value = 0;
                        coverageField.value = 0;
                        params.calculatedQuantityField.value = 0;
                        addLogWorkOrderLine(params.logField, tag['TAG022'] + expenseType.value);
                        return;
                    }
                }
                /* Covered by warranty */
                else if (applyWarranty(coverageField, params, "Expenses_Covered__c")) {
                    addLogWorkOrderLine(params.logField, tag['TAG009']);
                    totalLinePrice = 0;
                    params.quantity = (params.quantity).toFixed(3);
                    totalLinePrice = params.quantity * unitPriceField.value;
                    totalLinePrice = getBillableLinePrice(totalLinePrice, null, coverageField);
                    linePriceField.value = totalLinePrice;
                    if (params.isBillable)
                        totalWorkOrderPrice += parseFloat(totalLinePrice);
                    params.calculatedQuantityField.value = params.quantity;
                } else {
                    linePriceField.value = 0;
                    unitPriceField.value = 0;
                    coverageField.value = 0;
                    params.calculatedQuantityField.value = 0;
                    addLogWorkOrderLine(params.logField, tag['TAG022'] + expenseType.value);
                    return;
                }
            }
        }
        /*///////////////////////////////////////////////// END - EXPENSE FUNCTIONS //////////////////////////////////////////*/

        /*///////////////////////////////////////////////// START - TRAVEL FUNCTIONS ////////////////////////////////////////*/
        function processTravelLine(record, pb, params) {
            var linePriceField = getItemForDetailRecordKey(getTotalLinePriceField(record), record);
            var unitPriceField = getItemForDetailRecordKey(getUnitPriceField(record), record);
            var unitType = getItemForDetailRecordKey("Applied_Rate_Type__c", record);
            var coverageField = getItemForDetailRecordKey("Covered__c", record);

            var appliedTravelPolicy = null,
                regularRate = 0;
            appliedTravelPolicy = params.appliedTravelPolicy;
            if (!params.isLineEntitled && appliedTravelPolicy) {
                addLogWorkOrderLine(params.logField, tag['TAG021']);
                var unit = appliedTravelPolicy[getQualifiedFieldName("Unit__c")];
                var rate = 0,
                    i, l;
                var travelRoundingType;
                var travelToRoundNearest;
                var travel;
                var contractDefinitionInfo = getFromPriceBookDefinition(pb, "CONTRACT_DEFINITION");
                if (contractDefinitionInfo) {
                    contractDefinition = contractDefinitionInfo.data[0];
                    travelRoundingType = contractDefinition[getQualifiedFieldName("Travel_Rounding_Type__c")];
                    travelToRoundNearest = contractDefinition[getQualifiedFieldName("Round_Travel_To_Nearest__c")];
                    scMinimumTravel = contractDefinition[getQualifiedFieldName("Minimum_Travel__c")];
                }

                if (unit == "Tiered Per Mile/Km") {
                    clearTravelLine(record, pb, params);
                    var mileageTiersInfo = getFromPriceBookDefinition(pb, "CONTRACT_MILEAGETIERS");
                    if (mileageTiersInfo) {
                        var allMileageTiers = mileageTiersInfo.data,
                            l = allMileageTiers.length;
                        for (i = 0; i < l; i++) {
                            var mileageTier = allMileageTiers[i],
                                min = mileageTier[getQualifiedFieldName("Minimum__c")],
                                max = mileageTier[getQualifiedFieldName("Maximum__c")];

                            if (min == undefined || max == undefined) continue;

                            var mtEstimate = params.quantity;

                            if (mtEstimate >= min && mtEstimate <= max) {
                                var mtRateType = mileageTier[getQualifiedFieldName("Unit__c")];
                                var mtRate = mileageTier[getQualifiedFieldName("Rate__c")];

                                if (mtRateType == "Flat Rate") {
                                    regularRate = mtRate;
                                    rate = mtRate;
                                    params.calculatedQuantityField.value = 1;
                                } else {

                                    regularRate = mtRate;
                                    mtEstimate = (mtEstimate).toFixed(3);
                                    params.calculatedQuantityField.value = mtEstimate;
                                    rate = mtEstimate * mtRate;
                                }
                                break;
                            }

                        }
                    }
                    if (coverageField.value == null) coverageField.value = 0;
                } else if (unit == "Per Hour") {
                    regularRate = appliedTravelPolicy[getQualifiedFieldName("Rate__c")];
                    var estimatedDuration = getDuration(record, true);

                    if (estimatedDuration < 0) {
                        estimatedDuration = params.quantity * 60;
                    }
                    if (travelRoundingType && travelToRoundNearest) {
                        estimatedDuration = getRounded(travelRoundingType, travelToRoundNearest, estimatedDuration);
                    }
                    var minDuration = scMinimumTravel > estimatedDuration ? scMinimumTravel : estimatedDuration;
                    minDuration = (minDuration / 60).toFixed(3);
                    params.calculatedQuantityField.value = minDuration;
                    rate = minDuration * (regularRate);
                    if (coverageField.value == null) coverageField.value = 0;
                } else if (unit == "Zone Based") {
                    var contractDefinitionInfo = getFromPriceBookDefinition(pb, "CONTRACT_DEFINITION");
                    if (contractDefinitionInfo) {
                        contractDefinition = contractDefinitionInfo.data[0], zone = contractDefinition[getQualifiedFieldName("Zone__c")];
                        var zonePriceInfo = getFromPriceBookDefinition(pb, "CONTRACT_ZONEPRICING");
                        if (zonePriceInfo) {
                            var allzonePricing = zonePriceInfo.data,
                                l = allzonePricing.length;
                            for (i = 0; i < l; i++) {
                                var zonePricing = allzonePricing[i],
                                    zoneFromZonePricing = zonePricing[getQualifiedFieldName("Zone__c")];
                                if (zoneFromZonePricing == zone) {
                                    /* Apply flat rate */
                                    rate = zonePricing[getQualifiedFieldName("Rate__c")];
                                    regularRate = rate;
                                    params.calculatedQuantityField.value = 1;
                                    break;
                                }
                            }
                        }
                    }
                    if (coverageField.value == null) coverageField.value = 0;
                } else {
                    linePriceField.value = 0;
                    unitPriceField.value = 0;
                    coverageField.value = 0;
                    params.calculatedQuantityField.value = 0;
                    addLogWorkOrderLine(params.logField, tag['TAG023']);
                    $EXPR.Logger.warn(tag['TAG023']);
                    return;
                }
            }

            var appliedCoverage = {
                applied: false,
                isCovered: false
            };
            if (regularRate > 0 && !params.isLineEntitled) {
                appliedCoverage = applyServiceOffering(coverageField, params.so, "Travel_Discount_Covered__c", "Travel_Discount_Not_Covered__c");
                if (!appliedCoverage.applied) {
                    if (applyWarranty(coverageField, params, "Travel_Covered__c"))
                        addLogWorkOrderLine(params.logField, tag['TAG012']);
                } else {
                    appliedCoverage.isCovered == true ? addLogWorkOrderLine(params.logField, tag['TAG010']) : addLogWorkOrderLine(params.logField, tag['TAG011']);
                }

                unitPriceField.value = regularRate;
                var totalLinePrice = getBillableLinePrice(rate, null, coverageField);
                linePriceField.value = totalLinePrice;
                if (params.isBillable)
                    totalWorkOrderPrice += parseFloat(totalLinePrice);
                unitType.value = unit;
            }
            /* Covered by warranty */
            else if (params.warranty) {
                var totalLinePrice = 0;
                var travelDuration = getDuration(record, true);
                if (travelDuration < 0) {
                    travelDuration = params.quantity * 60;
                }
                params.quantity = (travelDuration / 60).toFixed(3);
                totalLinePrice = params.quantity * unitPriceField.value;
                linePriceField.value = totalLinePrice;
                if (params.isBillable)
                    totalWorkOrderPrice += parseFloat(totalLinePrice);
                params.calculatedQuantityField.value = params.quantity;
            }
        }