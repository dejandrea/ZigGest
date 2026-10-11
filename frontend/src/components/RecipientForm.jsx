import React from 'react';
import SupplierForm from './SupplierForm';
export default function RecipientForm({recipient,...props}){return <SupplierForm {...props} supplier={recipient} kind="recipient"/>;}
